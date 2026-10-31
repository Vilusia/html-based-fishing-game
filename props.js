// --- PROP SYSTEM (Added by Antigravity) ---
let myProps = []; // Local tracking if needed, but primarily server-authoritative
let props = Object.create(null); // {id: mesh}; peer ids cannot touch Object.prototype.
let activeProps = []; // HOST ONLY: Tracks props placed by remote clients
const PROP_PLAYER_LIMIT=10,PROP_ROOM_LIMIT=100;
const pendingPropRequests=new Map();
function localPlacedProps(){
    const device=String(typeof myDeviceID!=='undefined'&&myDeviceID||''),peer=typeof myPeerId!=='undefined'?myPeerId:null,ids=new Set(myProps.map(p=>p.id));
    return Object.values(props).map(m=>m.userData.propData).filter(p=>p&&(ids.has(p.id)||(device&&p.placer===device)||(peer&&p.owner===peer)));
}
function pendingPlacements(){for(const [id,p] of pendingPropRequests)if(Date.now()-p.at>5000)pendingPropRequests.delete(id);return [...pendingPropRequests.values()];}
function validateRemotePropPlacement(clientId,data){
    const reject=(error,abuse=false)=>({ok:false,error,abuse});
    if(data.propType!=='house'&&!outdoorPropDefinition(data.propType))return reject('Unknown prop type.',true);
    if(data.propType!=='house'&&!normalizePropUnlocks(data.unlockedProps).includes(data.propType))return reject('Buy this prop before placing it.');
    if(typeof data.propId!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(data.propId)||['__proto__','constructor','prototype'].includes(data.propId))return reject('Invalid prop id.',true);
    if(props[data.propId]||activeProps.some(p=>p.id===data.propId)||myProps.some(p=>p.id===data.propId))return reject('Duplicate prop id.',true);
    if(!Number.isFinite(data.x)||!Number.isFinite(data.z)||!Number.isFinite(data.rot))return reject('Invalid prop coordinates.',true);
    const main=window.Ocean.inBounds(data.x,data.z,-.01),special=(Math.abs(data.x-10000)<500&&Math.abs(data.z-10000)<500)||(Math.abs(data.x+20000)<500&&Math.abs(data.z)<500);
    if(!main&&!special)return reject('Prop position is outside the world.',true);
    const peer=otherPlayers[clientId]?.lastData,pos=peer?.pos;
    if(!pos||![pos.x,pos.y,pos.z].every(Number.isFinite)||peer.houseOwner)return reject('Place outdoor props while outside.');
    if(Math.hypot(data.x-pos.x,data.z-pos.z)>(data.propType==='house'?18:8))return reject('Props must be placed near your player.',true);
    if(data.propType==='house'&&!window.Ocean.inBounds(data.x,data.z,2))return reject('Place your home on the main map.');
    const owner=activeProps.filter(p=>p.owner===clientId),device=String(clientConns[clientId]?.deviceID||clientId);
    if(data.propType==='house'&&Object.values(props).some(m=>m.userData.propData?.type==='house'&&(m.userData.propData.owner===clientId||m.userData.propData.placer===device)))return reject('You already placed a home. Undo it before placing another.');
    if(owner.length>=PROP_PLAYER_LIMIT)return reject('You can place at most '+PROP_PLAYER_LIMIT+' props. Undo one first.');
    if(Object.keys(props).length>=PROP_ROOM_LIMIT)return reject('The room has reached its prop limit.');
    if(data.propType==='screen'&&Object.values(props).filter(m=>m.userData.propData?.type==='screen').length>=MAX_YT_SCREENS)return reject('The room has reached its screen limit.');
    if(data.propType==='house'){const water=waterSurfaceAt(data.x,data.z);if(water!==null&&getTerrainHeight(data.x,data.z)<water)return reject('Place homes on dry land.');}
    return {ok:true};
}
function removePropsOwnedBy(peer){
    const doomed=activeProps.filter(p=>p.owner===peer);activeProps=activeProps.filter(p=>p.owner!==peer);
    for(const p of doomed){removePropFromWorld(p.id);broadcastToClients({type:'propRemoved',id:p.id});}
}
window.propPlacementNotice=function(data){pendingPropRequests.delete(data.id);showToast(String(data.message||'Unable to place prop.').slice(0,180));};

window.togglePropsUI = function () {
    const ui = document.getElementById('props-ui');
    const isOpen = ui.style.display === 'flex';

    if (!isOpen) {
        // --- OPENING PROPS UI ---
        ui.style.display = 'flex';
        renderPropsUI();

        // Unlock mouse
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Freeze first-person controls
        if (typeof isFirstPerson !== 'undefined' && isFirstPerson) {
            cameraFrozen = true;
            inputBlocked = true;
            if (player) player.freezeControls = true;
        }

        // Hide instructions (matches shop/options/etc)
        const instr = document.getElementById('instructions');
        if (instr) instr.style.display = 'none';
    }
    else {
        // --- CLOSING PROPS UI ---
        ui.style.display = 'none';

        // Restore controls
        if (typeof isFirstPerson !== 'undefined' && isFirstPerson) {
            cameraFrozen = false;
            inputBlocked = false;
            if (player) player.freezeControls = false;

            // Re-lock mouse on close
            const canvas = renderer?.domElement;
            if (canvas && !document.pointerLockElement) {
                canvas.requestPointerLock();
            }
        }

        // Restore instructions
        const instr = document.getElementById('instructions');
        if (instr) instr.style.display = 'grid';
    }
};




function renderPropsUI() {
    const list = document.getElementById('props-list');
    if (!list) return;
    list.innerHTML = '';

    const balance=document.getElementById('props-balance');
    if(balance)balance.textContent='$'+Number(saveState.money||0).toLocaleString()+' available';
    const items=[...OUTDOOR_PROPS,{id:'house',name:'Player House',icon:'home'}];
    items.forEach(item=>{
        const owned=ownsOutdoorProp(item.id),button=document.createElement('button');
        button.type='button';button.className='grid-entry prop-card'+(owned?' is-owned':' is-locked');
        const icon=window.PX?PX.icon(item.icon,30):'';
        button.innerHTML='<div>'+icon+'</div><div>'+item.name+'</div><span class="prop-ownership">'+(owned?'Unlocked':'$'+item.price.toLocaleString())+'</span><span class="prop-action">'+(owned?'Place':'Buy unlock')+'</span>';
        button.setAttribute('aria-label',item.name+(owned?' — place':' — unlock for $'+item.price));
        if(item.id==='house'&&(localPlacedProps().some(p=>p.type==='house')||pendingPlacements().some(p=>p.type==='house'))){button.disabled=true;button.querySelector?.('.prop-action')?.replaceChildren('Already placed');}
        button.onclick=()=>{
            if(!ownsOutdoorProp(item.id)){buyOutdoorProp(item.id);renderPropsUI();return;}
            if(placeProp(item.id))togglePropsUI();
        };
        list.appendChild(button);
    });
}
function placeProp(type) {
    if(!ownsOutdoorProp(type)){showToast('Buy this prop in the Props menu first.');return false;}
    if(window.Housing && Housing.inside){showToast('Use Customize > Furniture store & layout to furnish your house.');return;}
    const placed=localPlacedProps(),pending=pendingPlacements();
    if(type==='house'&&(placed.some(p=>p.type==='house')||pending.some(p=>p.type==='house'))){showToast('You already placed a home. Undo it before placing another.');return false;}
    if(placed.length+pending.length>=PROP_PLAYER_LIMIT){showToast('You can place at most '+PROP_PLAYER_LIMIT+' props. Undo one first.');return false;}
    if(Object.keys(props).length>=PROP_ROOM_LIMIT){showToast('The room has reached its prop limit.');return false;}
    // RATE LIMIT
    if (Date.now() - lastPropTime < PROP_COOLDOWN) {
        showToast("Slow down!", 'error');
        return;
    }

    // --- SCREEN: no prompt at placement time; add the video via E afterwards ---
    let src = null;
    if (type === 'screen') {
        // Room-wide cap: each embed is its own iframe (heavy), so limit how
        // many screens a room may show at once.
        const ytCount = Object.keys(ytPlayers).filter(id => ytPlayers[id] && !ytPlayers[id].inHouse).length;
        if (ytCount >= MAX_YT_SCREENS) {
            showToast('This room already has ' + MAX_YT_SCREENS + ' screens.', 'error');
            return;
        }
        // src stays null; the placer adds a video through the queue panel (E).
    }

    lastPropTime = Date.now();

    let x = parseFloat(player.position.x.toFixed(2));
    let z = parseFloat(player.position.z.toFixed(2));
    let rot = parseFloat(player.rotation.y.toFixed(3));
    if(type==='house'){
        if(isInVoid||isInLavaWorld){showToast('Place houses on the main island or a custom level.');return;}
        x+=Math.sin(rot)*8;z+=Math.cos(rot)*8;rot+=Math.PI;
        const surface=waterSurfaceAt(x,z),height=getTerrainHeight(x,z);
        if(surface!==null&&height<surface){showToast('Place houses on dry land.');return;}
    } // Add rotation

    // Wall-clock anchor for video sync: every client advances its own player
    // from startedAt, so no periodic timestamps are needed to stay in step.
    const startedAt = Date.now();

    const propData = {
        id: Date.now() + "_" + Math.random().toString().substr(2, 5),
        type,
        x,
        z,
        rot, // Include rotation in prop data
        // Source fields (null for every other prop type)
        provider: src ? src.provider : null,
        videoId: src && src.provider === 'youtube' ? src.id : null,
        twitchId: src && src.provider === 'twitch' ? src.id : null,
        twitchKind: src && src.provider === 'twitch' ? src.twitchKind : null,
        queue: src ? [{ provider: src.provider, id: src.id, twitchKind: src.twitchKind || null }] : [],
        queueIndex: 0,
        startedAt: startedAt,
        placer: String(myDeviceID || ''),
        owner: typeof myPeerId!=='undefined'&&myPeerId?myPeerId:'solo-player',
        timestamp: Date.now()
    };

    if (isHost) {
        spawnPropMesh(propData);
        myProps.push(propData);
        broadcastToClients({ type: 'propPlaced', prop: propData });
        if (src && src.provider === 'youtube') startYtSyncLoop(propData);
    } else if (hostConn && hostConn.open) {
        pendingPropRequests.set(propData.id,{type,at:Date.now()});
        hostConn.send({
            type: 'placeProp',
            propType: type,
            unlockedProps: normalizePropUnlocks(saveState.unlockedProps),
            // The host relays our id back in propPlaced so ALL records across
            // the room share one id (this keeps the sync key stable).
            propId: propData.id,
            x,
            z,
            rot, // Send rotation to host
            // Source fields for the host to carry into the record it relays
            provider: propData.provider,
            videoId: propData.videoId,
            twitchId: propData.twitchId,
            twitchKind: propData.twitchKind,
            queue: propData.queue,
            startedAt: startedAt,
            placer: String(myDeviceID || '')
        });
        if (src && src.provider === 'youtube') startYtSyncLoop(propData);
    } else {
        // Single-player (no host): spawn locally.
        spawnPropMesh(propData);
        myProps.push(propData);
    }

    // Progression: count placements for the "Decorator" achievement. Props
    // are session-scoped, so the count lives in the save rather than being
    // derived from the scene.
    saveState.propsPlaced = (Number(saveState.propsPlaced) || 0) + 1;
    if (typeof notifyPropPlaced === 'function') notifyPropPlaced();
    return true;
}


function undoProp() {
    if (isHost||!hostConn?.open) {
        // Host Undo
        if (myProps.length > 0) {
            const last = myProps.pop();
            removePropFromWorld(last.id);
            broadcastToClients({ type: 'propRemoved', id: last.id });
        }
    } else if (hostConn && hostConn.open) {
        // Client Request Undo
        hostConn.send({ type: 'undoProp' });
    }
}

// Placeable outdoor props share the same renderer in both character modes.
function spawnPropMesh(data) {
    if(!data||typeof data.id!=='string'||data.id.length>40||!Number.isFinite(data.x)||!Number.isFinite(data.z))return;
    pendingPropRequests.delete(data.id);
    if (props[data.id]) return;
    if(Object.keys(props).length>=PROP_ROOM_LIMIT)return;

    let mesh;
    const g = new THREE.Group();

    if(data.type==='house'){
        g.add(WorldGen.makeBuilding({type:'house',scale:1,rot:0}));
        g.userData.isPlayerHouse=true;
    }else{
        const model=buildOutdoorProp(data.type);
        if(!model)return;
        g.add(model);
        Object.assign(g.userData,model.userData);
        if(data.type==='screen')attachYtVideo(data,g);
    }
    // Ensure a queue record exists even when no video is mounted yet, so the
    // queue panel can manage screens placed without an initial URL.
    if (data.type === 'screen') {
        if (!Array.isArray(data.queue)) data.queue = [];
        if (!ytPlayers[data.id]) {
            ytPlayers[data.id] = { data: data, provider: data.provider || null, mesh: g, ended: false, queue: data.queue };
        } else {
            ytPlayers[data.id].data = data;
            if (!Array.isArray(ytPlayers[data.id].data.queue)) ytPlayers[data.id].data.queue = data.queue;
        }
    }

    mesh = g;
    // Get terrain height for proper Y positioning
    const terrainY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(data.x, data.z) : 0;
    mesh.position.set(data.x, terrainY, data.z);

    // Use the rotation from the network data. Every prop sender includes it,
    // so a missing/invalid rot means OLD-VERSION peer data: fall back to 0
    // (a stable direction) rather than the local viewer's rotation, which
    // would face the prop differently on every player's screen.
    if (typeof data.rot === 'number' && isFinite(data.rot)) {
        mesh.rotation.y = data.rot;
    } else {
        mesh.rotation.y = 0;
    }

    scene.add(mesh);
    props[data.id] = mesh;
    let fireSeed=0;for(const ch of String(data.id))fireSeed=(fireSeed*31+ch.charCodeAt(0))>>>0;
    mesh.userData.fireSeed=(fireSeed%10000)/100;
    if(data.type==='house' && window.Housing)Housing.registerExterior(mesh);
    // Keep the authoritative record on the mesh so interactions (e.g. changing
    // a YouTube Screen's video) can find the prop's data and its placer.
    mesh.userData.propData = data;

    if (typeof broadcastSound === 'function') {
        broadcastSound('footstep', 0);
    }
}

window.tickPropAnimations=function(seconds=Date.now()/1000){
    for(const id in props){const prop=props[id];if(prop.userData.fireAnimation)animateOutdoorPropFire(prop,seconds,prop.userData.fireSeed);}
};

function removeScreenEntry(id) {
    const e = ytPlayers[id];
    if (!e) return;
    destroyTwitchControl(e);
    try { if (e.player && e.player.destroy) e.player.destroy(); } catch (err) { }
    if (e.twFrame) { e.twFrame.remove(); e.twFrame = null; }
    if (e.soundChip) { e.soundChip.remove(); e.soundChip = null; }
    if (e.cssObj && e.cssObj.parent) e.cssObj.parent.remove(e.cssObj);
    if (e.shell && e.shell.parentNode) e.shell.parentNode.removeChild(e.shell);
    delete ytPlayers[id];
}
window.removeScreenById = removeScreenEntry;

function removePropFromWorld(id) {
    pendingPropRequests.delete(id);myProps=myProps.filter(p=>p.id!==id);
    if (props[id]) {
        const p = props[id];
        // Outdoor placements own their resources; house assets have a separate lifecycle.
        if(p.userData.outdoorProp){
            const geometries=new Set(),materials=new Set();
            p.traverse(c=>{if(c.geometry)geometries.add(c.geometry);if(c.material)(Array.isArray(c.material)?c.material:[c.material]).forEach(m=>materials.add(m));});
            geometries.forEach(v=>v.dispose());materials.forEach(v=>v.dispose());
        }
        p.traverse(c => { if (c.isLight) c.dispose && c.dispose(); });
        scene.remove(p);
        delete props[id];
    }
    // Video cleanup: destroy the YouTube player, drop the CSS3D object and
    // stop the placer's sync heartbeat.
    removeScreenEntry(id);
    if (ytSyncLoops[id]) { clearInterval(ytSyncLoops[id]); delete ytSyncLoops[id]; }
}

// ===========================================================================
// STREAM PLAYER (YouTube + Twitch)
// ---------------------------------------------------------------------------
// The placer pastes a YouTube or Twitch URL.
//
// YouTube: every client embeds the video with the official IFrame API (hidden
// controls, muted until proximity says otherwise) and advances to the shared
// wall-clock anchor (prop.startedAt), so playback stays in sync with NO
// heartbeats. The placer also broadcasts a small ytSync heartbeat every 2s to
// correct clock skew; everyone else applies it.
//
// Twitch: muted autoplay, but the player lives in its own screen-space layer
// that tracks the panel (see twitchLayer below). Twitch's autoplay gate runs
// IntersectionObserver v2 inside its iframe and refuses players it cannot see:
// anything faded out, clipped away, inside a preserve-3d wrapper, or smaller
// than its minimum size gets "Autoplay disabled ... style visibility". So the
// iframe keeps a real 640x360 layout, is never faded, and is mapped onto the
// panel with a flat projective (matrix3d homography) transform - no perspective
// or preserve-3d context - while the depth punch crops it to the opening.
// The SOUND chip reloads the embed unmuted on a real top-document click.
//
// Rendering: iframes cannot be blitted into WebGL (cross-origin), so they live
// in the DOM. YouTube follows the prop through CSS3DRenderer (three r128
// examples, pinned the same way as three itself); Twitch uses the flat layer.
// The WebGL canvas is composited above both and punchScreens() erases its
// alpha behind the video, so the world still draws in front of the screen.
// ===========================================================================
const MAX_YT_SCREENS = 5;
const ytPlayers = {};
const ytSyncLoops = {};
let ytApiReady = false;
const ytPlayerQueue = [];
let cssRenderer = null;
let cssScene = null;
let houseCssRenderer = null;
let houseCssScene = null;
let ytOverlay = null;
// Twitch players live OUTSIDE the CSS3D tree. Twitch's autoplay gate uses
// IntersectionObserver v2 (trackVisibility) from inside the iframe; an element
// inside a preserve-3d/perspective wrapper makes that observer report the
// player as not visible, which permanently disables autoplay with
// "Autoplay disabled ... style visibility". A plain, untransformed iframe that
// tracks the panel's projected rect on screen autoplays fine, and it still sits
// under the WebGL canvas, so punchScreens() keeps the world in front of it.
let twitchLayer = null;

// The YouTube IFrame API invokes window.onYouTubeIframeAPIReady exactly once
// when its script finishes loading. On repeat visits the script is cached and
// can finish BEFORE this file is parsed, so the callback would be assigned too
// late and no player would ever be created (this is why a host who reloads
// often saw black screens while everyone else saw video).
function markYtApiReady() {
    if (ytApiReady) return;
    ytApiReady = true;
    const queued = ytPlayerQueue.splice(0);
    queued.forEach(fn => { try { fn(); } catch (e) { } });
}
window.onYouTubeIframeAPIReady = markYtApiReady;
// If the API is already present, we missed the callback: treat it as ready now.
if (window.YT && typeof window.YT.Player === 'function') markYtApiReady();

// --- Stream source validation ---------------------------------------------
// A screen only ever mounts a canonical video id or channel name. The pasted
// text must be a real link on an allowlisted YouTube/Twitch host: checking the
// parsed hostname (instead of searching the raw string) rejects tricks such as
// `youtube.com.evil.example`, `evil.example/?v=<id>`, or a bare 11-char id.
function toHttpUrl(input) {
    let raw = String(input || '').trim();
    if (!raw) return null;
    if (raw.startsWith('//')) {
        raw = 'https:' + raw;
    } else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        // Scheme-less links are fine, bare ids/channel names are not.
        if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:[:/?#]|$)/.test(raw)) return null;
        raw = 'https://' + raw;
    }
    let u;
    try { u = new URL(raw); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // Legit links never carry credentials or a non-default port.
    if (u.username || u.password || u.port) return null;
    return u;
}

const YT_HOSTS = new Set([
    'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
    'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'
]);
const TWITCH_HOSTS = new Set([
    'twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'go.twitch.tv', 'player.twitch.tv'
]);

// Accepts the common YouTube video URL forms; returns an 11-char id or null.
function ytParseVideoId(input) {
    const u = toHttpUrl(input);
    if (!u) return null;
    const host = u.hostname.toLowerCase();
    if (!YT_HOSTS.has(host)) return null;
    const segs = u.pathname.split('/').filter(Boolean);
    const valid = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);

    // youtu.be/<id> (exactly one path segment)
    if (host === 'youtu.be') {
        return (segs.length === 1 && valid(segs[0])) ? segs[0] : null;
    }
    // youtube-nocookie.com/embed/<id>
    if (host === 'youtube-nocookie.com' || host === 'www.youtube-nocookie.com') {
        return (segs.length === 2 && segs[0] === 'embed' && valid(segs[1])) ? segs[1] : null;
    }
    // youtube.com/watch?v=<id>
    if (segs.length === 1 && segs[0] === 'watch') {
        const v = u.searchParams.get('v');
        return valid(v) ? v : null;
    }
    // youtube.com/{embed,shorts,live,v}/<id>
    if (segs.length === 2 && ['embed', 'shorts', 'live', 'v'].includes(segs[0]) && valid(segs[1])) {
        return segs[1];
    }
    return null;
}

// Twitch channel names that are really site routes, not streamers.
const TWITCH_RESERVED = new Set([
    'directory', 'videos', 'settings', 'subscriptions', 'inventory', 'wallet',
    'friends', 'drops', 'search', 'downloads', 'turbo', 'jobs', 'about',
    'privacy', 'policies', 'collections', 'following', 'store', 'prime',
    'creatorcamp', 'legal', 'contact', 'security', 'careers', 'press', 'blog',
    'partners', 'affiliates', 'developers', 'api', 'embed', 'login', 'signup',
    'p', 'video', 'channel', 'clips', 'clip', 'team', 'teams', 'schedule',
    'events', 'community', 'dashboard', 'messages', 'whispers', 'notifications',
    'logout', 'oauth', 'activate', 'help', 'support', 'safety', 'transparency',
    'advertisers', 'extensions', 'bits', 'gift', 'gifts', 'redeem', 'rewards',
    'squad', 'streamers', 'tags', 'games', 'music', 'podcasts', 'vods',
    'highlights', 'payments', 'purchases'
]);

function isTwitchChannelName(s) {
    return typeof s === 'string' && /^[A-Za-z0-9_]{1,25}$/.test(s) && !TWITCH_RESERVED.has(s.toLowerCase());
}

// Accepts twitch.tv/<channel>, twitch.tv/videos/<id> and player.twitch.tv
// URLs. Returns { id, kind } or null.
function twitchParseSource(input) {
    const u = toHttpUrl(input);
    if (!u) return null;
    const host = u.hostname.toLowerCase();
    if (!TWITCH_HOSTS.has(host)) return null;

    // player.twitch.tv/?channel=<name> or ?video=<id>
    if (host === 'player.twitch.tv') {
        const video = u.searchParams.get('video');
        if (video && /^\d{1,20}$/.test(video)) return { id: video, kind: 'video' };
        const channel = u.searchParams.get('channel');
        if (isTwitchChannelName(channel)) return { id: channel, kind: 'channel' };
        return null;
    }

    const segs = u.pathname.split('/').filter(Boolean);
    // twitch.tv/videos/<numeric vod id>
    if (segs.length === 2 && segs[0] === 'videos' && /^\d{1,20}$/.test(segs[1])) {
        return { id: segs[1], kind: 'video' };
    }
    // twitch.tv/<channel> (exactly one path segment; listings/clips are not
    // a stream and are rejected)
    if (segs.length === 1 && isTwitchChannelName(segs[0])) {
        return { id: segs[0], kind: 'channel' };
    }
    return null;
}

// Resolve a pasted URL to a screen source.
//   YouTube: { provider:'youtube', id:'<11-char id>' }
//   Twitch:  { provider:'twitch', id:'<channel or vod id>', twitchKind:'channel'|'video' }
function parseScreenSource(input) {
    if (!input) return null;
    const raw = String(input).trim();
    const yt = ytParseVideoId(raw);
    if (yt) return { provider: 'youtube', id: yt };
    const tw = twitchParseSource(raw);
    if (tw) return { provider: 'twitch', id: tw.id, twitchKind: tw.kind };
    return null;
}
window.parseScreenSource = parseScreenSource;

// Canonicalise source fields that arrived over the network. Prop records can
// come from older clients, so the renderer validates them too instead of
// trusting whatever id/provider strings are in the packet.
function screenSourceFromData(data) {
    if (!data) return null;
    const ytId = (typeof data.videoId === 'string') ? data.videoId : '';
    const twId = (typeof data.twitchId === 'string') ? data.twitchId : '';
    const ytOk = /^[A-Za-z0-9_-]{11}$/.test(ytId);
    const twVodOk = /^\d{1,20}$/.test(twId);
    const twChOk = isTwitchChannelName(twId);

    if (data.provider === 'youtube') return ytOk ? { provider: 'youtube', id: ytId } : null;
    if (data.provider === 'twitch') {
        if (data.twitchKind === 'video') {
            return twVodOk ? { provider: 'twitch', id: twId, twitchKind: 'video' } : null;
        }
        return twChOk ? { provider: 'twitch', id: twId, twitchKind: 'channel' } : null;
    }
    // Legacy records without a provider field.
    if (ytOk) return { provider: 'youtube', id: ytId };
    if (twVodOk) return { provider: 'twitch', id: twId, twitchKind: 'video' };
    if (twChOk) return { provider: 'twitch', id: twId, twitchKind: 'channel' };
    return null;
}

// One-time renderer init, called from setupThreeJS() when the game world is
// built. No-op when the example renderer did not load (offline CDN etc).
window.initCssScene = function () {
    if (typeof THREE === 'undefined' || typeof THREE.CSS3DRenderer === 'undefined') return;
    if (!cssRenderer) {
        cssRenderer = new THREE.CSS3DRenderer();
        cssRenderer.setSize(window.innerWidth, window.innerHeight);
        const el = cssRenderer.domElement;
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        // The whole CSS3D overlay must not eat game input.
        el.style.pointerEvents = 'none';
        el.style.zIndex = '2';
        const gc = document.getElementById('game-container');
        if (gc) gc.appendChild(el);
        cssScene = new THREE.Scene();
    }
    if (!houseCssRenderer) {
        houseCssRenderer = new THREE.CSS3DRenderer();
        houseCssRenderer.setSize(window.innerWidth, window.innerHeight);
        const el = houseCssRenderer.domElement;
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '2';
        el.style.display = 'none';
        const gc = document.getElementById('game-container');
        if (gc) gc.appendChild(el);
        houseCssScene = new THREE.Scene();
    }
};
window.setHouseCssVisible = function (visible) {
    if (!houseCssRenderer) return;
    houseCssRenderer.domElement.style.display = visible ? '' : 'none';
};
window.renderHouseCss = function (camera, force) {
    if (!houseCssRenderer || !houseCssScene || !camera) return;
    if (!force && !(window.Housing && Housing.inside)) return;
    houseCssRenderer.setSize(window.innerWidth, window.innerHeight);
    houseCssRenderer.render(houseCssScene, camera);
};

// Wire the video element + CSS3D object for a screen prop.
function attachYtVideo(data, group, options) {
    options = options || {};
    const inHouse = !!options.inHouse;
    const panelY = options.panelY !== undefined ? options.panelY : PANEL_Y;
    const panelW = options.panelW !== undefined ? options.panelW : PANEL_W;
    const panelH = options.panelH !== undefined ? options.panelH : PANEL_H;
    const forward = options.forward !== undefined ? options.forward : VIDEO_FORWARD;
    const videoScale = options.scale !== undefined ? options.scale : (inHouse ? panelW / 640 : 0.009844);
    const yawOffset = options.yawOffset !== undefined ? options.yawOffset : Math.PI;
    const src = screenSourceFromData(data);

    // Make sure the CSS3D overlay exists BEFORE creating the element.
    if ((!cssRenderer || (inHouse && !houseCssRenderer)) && window.initCssScene) window.initCssScene();
    const targetScene = inHouse ? houseCssScene : cssScene;
    const meta = { inHouse, isHouse: inHouse, houseOwnerLocal: !!options.houseOwner, panelY, panelW, panelH, forward, yawOffset, scene: targetScene };

    // No source yet: create a shell + entry so the queue panel works, but
    // don't mount a player.
    if (!src) {
        const shell = document.createElement('div');
        shell.style.width = '640px';
        shell.style.height = '360px';
        shell.style.background = '#050505';
        shell.style.pointerEvents = 'none';
        shell.style.overflow = 'hidden';
        if (ytOverlay && !inHouse) ytOverlay.appendChild(shell);
        const cssObj = (typeof THREE !== 'undefined' && THREE.CSS3DObject) ? new THREE.CSS3DObject(shell) : null;
        if (cssObj) { cssObj.scale.set(videoScale, videoScale, 1); if (targetScene) targetScene.add(cssObj); }
        const entry = {
            data: data,
            provider: null,
            cssObj: cssObj,
            shell: shell,
            frameEl: null,
            player: null,
            mesh: group,
            placed: true,
            syncAt: null,
            syncRecvAt: null,
            retried: false,
            ended: false,
            queue: Array.isArray(data.queue) ? data.queue.slice() : [],
            ...meta
        };
        if (!Array.isArray(data.queue)) data.queue = entry.queue;
        ytPlayers[data.id] = entry;
        return;
    }

    const provider = src.provider;
    if (typeof THREE.CSS3DObject === 'undefined') {
        console.warn('[screen] CSS3DRenderer missing — screen stays black');
        return;
    }

    const shell = document.createElement('div');
    shell.style.width = '640px';
    shell.style.height = '360px';
    shell.style.background = '#050505';
    shell.style.pointerEvents = 'none';
    shell.style.overflow = 'hidden';
    // The picture only exists on the panel's front side; tickYtScreens hides it
    // once the camera swings around behind the housing. (No backface-visibility
    // here: CSS3DRenderer's mirrored projection makes that ambiguous, and an
    // explicit dot-product test is predictable.)
    shell.style.transformStyle = 'preserve-3d';

    // Attach to the DOM first. The CSS3D object owns placement; this container
    // makes the node findable even if the 3D scene renders later.
    if (!ytOverlay) {
        ytOverlay = document.createElement('div');
        ytOverlay.style.position = 'fixed';
        ytOverlay.style.left = '0';
        ytOverlay.style.top = '0';
        ytOverlay.style.width = '0';
        ytOverlay.style.height = '0';
        ytOverlay.style.overflow = 'visible';
        ytOverlay.style.pointerEvents = 'none';
        ytOverlay.style.zIndex = '-1';
        document.body.appendChild(ytOverlay);
    }

    const cssObj = new THREE.CSS3DObject(shell);
    // 640px wide shell mapped to the panel's world width.
    cssObj.scale.set(videoScale, videoScale, 1);
    if (targetScene) targetScene.add(cssObj);
    else if (!inHouse) ytOverlay.appendChild(shell); // fallback: at least keep it mountable

    const entry = {
        data: {
            // The prop id must survive here: the ENDED handler and the sync
            // loop cleanup key off it (applyYtChange keeps it too).
            id: data.id,
            provider: provider,
            videoId: provider === 'youtube' ? src.id : null,
            twitchId: provider === 'twitch' ? src.id : null,
            twitchKind: provider === 'twitch' ? src.twitchKind : null,
            queue: Array.isArray(data.queue) ? data.queue.slice() : [],
            startedAt: data.startedAt || Date.now(),
            paused:data.paused===true,pausedAt:Math.max(0,Number(data.pausedAt)||0),
            placer: data.placer || ''
        },
        player: null,
        iframe: null,
        twFrame: null,
        twVideoWrap: null,
        twitchAudioOn: false,
        twitchSwapAt: 0,
        provider: provider,
        cssObj: cssObj,
        shell: shell,
        frameEl: null,
        mesh: group,
        placed: true,
        syncAt: null,
        syncRecvAt: null,
        retried: false,
        ...meta
    };
    ytPlayers[data.id] = entry;
    if (!Array.isArray(data.queue)) data.queue = entry.data.queue;
    mountScreenContent(entry);
}

// Mount (or remount) the Flat-screen TV inside a player house. The furniture
// item carries the validated stream queue/source; guests receive it in
// house:update, and only the local house owner gets queue controls.
window.attachHouseTv = function (id, item, mesh, owner, isOwner, onChange) {
    if (!item || !mesh || !window.Furniture) return;
    const info = Furniture.byId[item.type];
    if (!info || (item.type !== 'stream_tv' && item.type !== 'wall_tv')) return;
    const screen = info.screen || { w: info.w * .9, h: (info.w * .9) * 9 / 16, y: info.h * .62, forward: info.d * .36 };
    const stream = item.stream || null;
    const data = {
        id: id,
        provider: stream ? stream.provider : null,
        videoId: stream ? stream.videoId : null,
        twitchId: stream ? stream.twitchId : null,
        twitchKind: stream ? stream.twitchKind : null,
        queue: stream && Array.isArray(stream.queue) ? stream.queue.slice() : [],
        startedAt: stream ? stream.startedAt : Date.now(),
        paused:stream?.paused===true,pausedAt:Math.max(0,Number(stream?.pausedAt)||0),
        placer: owner || ''
    };
    attachYtVideo(data, mesh, { inHouse: true, houseOwner: !!isOwner, panelY: screen.y, panelW: screen.w, panelH: screen.h, forward: screen.forward, scale: screen.w / 640, yawOffset: 0 });
    const entry = ytPlayers[id];
    if (entry && typeof onChange === 'function') entry.houseSync = onChange;
};

// (Re)build the player inside an existing shell. Used on placement, on a
// video change, and whenever the provider differs (YouTube <-> Twitch).
function mountScreenContent(entry) {
    const shell = entry && entry.shell;
    if (!shell) return;
    destroyTwitchControl(entry);

    // Tear down whatever was mounted before.
    try { if (entry.player && entry.player.destroy) entry.player.destroy(); } catch (e) { }
    entry.player = null;
    entry.iframe = null;
    entry.soundChip = null;
    entry.twitchPending = false;
    entry.twitchReady = false;
    if (entry.twFrame) { entry.twFrame.remove(); entry.twFrame = null; }
    entry.twVideoWrap = null;
    shell.innerHTML = '';
    // The shell is only the dark backing behind the picture now; the Twitch
    // iframe lives in its own screen-space layer so it can autoplay. Never let
    // the 3D panel eat clicks.
    shell.style.pointerEvents = 'none';
    shell.style.cursor = 'default';

    const twitch = entry.provider === 'twitch';

    const frameEl = document.createElement('div');
    frameEl.style.width = '100%';
    frameEl.style.height = '100%';
    frameEl.style.pointerEvents = twitch ? 'auto' : 'none';
    shell.appendChild(frameEl);
    entry.frameEl = frameEl;

    if (twitch) {
        // Screen-space layer, positioned every frame from the panel corners.
        // Mounting is deferred until the panel is actually on screen, so the
        // player never starts inside a zero-size or off-screen element (Twitch
        // latches its autoplay verdict at load time).
        const twFrame = document.createElement('div');
        twFrame.style.position = 'absolute';
        twFrame.style.left = '0';
        twFrame.style.top = '0';
        twFrame.style.width = '640px';
        twFrame.style.height = '360px';
        twFrame.style.overflow = 'hidden';
        // The shell behind this layer is already the dark panel. Keep the
        // bounding box transparent: the screen-space Twitch layer paints above
        // every CSS3D YouTube screen, so an opaque rectangle here used to black
        // out a nearby/overlapping YouTube screen.
        twFrame.style.background = 'transparent';
        twFrame.style.pointerEvents = 'none';
        twFrame.style.display = 'none';
        // Inner 640x360 layout, uniformly scaled to cover the projected box.
        const twVideoWrap = document.createElement('div');
        twVideoWrap.style.position = 'absolute';
        twVideoWrap.style.left = '0';
        twVideoWrap.style.top = '0';
        twVideoWrap.style.width = '640px';
        twVideoWrap.style.height = '360px';
        twVideoWrap.style.transformOrigin = '0 0';
        twFrame.appendChild(twVideoWrap);
        ensureTwitchLayer().appendChild(twFrame);
        entry.twFrame = twFrame;
        entry.twVideoWrap = twVideoWrap;
        entry.twitchPending = true;
        if (!entry.twitchUnmuted) addSoundChip(twFrame, entry);
        return;
    }

    // YouTube: never rely on the ready flag alone. If the API object exists we
    // can create immediately, even when the init callback fired before this
    // file was parsed (cached YouTube loader on repeat visits).
    if (ytApiReady || (window.YT && typeof window.YT.Player === 'function')) {
        markYtApiReady();
        createYtPlayer(entry);
    } else {
        ytPlayerQueue.push(() => createYtPlayer(entry));
    }
}

// Twitch requires every embed's `parent` to match the page's hostname.
function twitchParents() {
    const parents = [];
    try {
        const h = String(location.hostname || '').toLowerCase();
        if (h) {
            parents.push(h);
            if (h.indexOf('www.') === 0) parents.push(h.slice(4));
        }
    } catch (e) { }
    return parents;
}

function twitchEmbedUrl(entry, mutedOverride) {
    const d = entry.data || {};
    const q = [];
    if (d.twitchKind === 'video' && d.twitchId) q.push('video=' + encodeURIComponent(d.twitchId));
    else q.push('channel=' + encodeURIComponent(d.twitchId || ''));
    // Muted autoplay is the only form of autoplay every browser allows inside a
    // cross-origin iframe, so the stream always starts on its own. Sound is an
    // explicit opt-in: the in-world SOUND chip reloads the embed with
    // muted=false in response to a real click in the top document. The embed is
    // also swapped back to muted when the listener walks out of earshot - the
    // iframe owns its own audio, so that is the only volume control we have.
    const muted = (typeof mutedOverride === 'boolean') ? mutedOverride : !entry.twitchUnmuted;
    q.push('autoplay=true');
    q.push('muted=' + (muted ? 'true' : 'false'));
    twitchParents().forEach(p => q.push('parent=' + encodeURIComponent(p)));
    return 'https://player.twitch.tv/?' + q.join('&');
}

// Is (clientX, clientY) on a visible Twitch screen? Used as a fallback path for
// starting sound: clicks over a cross-origin iframe never reach this document,
// but if anything ever swallows them we still catch the click here.
window.twitchScreenAt = function (clientX, clientY) {
    if (typeof camera === 'undefined' || !camera || typeof ytPlayers === 'undefined') return null;
    const indoor = !!(window.Housing && Housing.inside);
    for (const id in ytPlayers) {
        const e = ytPlayers[id];
        if (!e || e.provider !== 'twitch' || !e.__shown || !e.mesh || !!e.inHouse !== indoor) continue;
        const p = screenWorld(e);
        const ry = screenYaw(e);
        const forward = e.forward !== undefined ? e.forward : VIDEO_FORWARD;
        const panelY = e.panelY !== undefined ? e.panelY : PANEL_Y;
        const cx = p.x + Math.sin(ry) * forward;
        const cy = p.y + panelY;
        const cz = p.z + Math.cos(ry) * forward;
        const rx = Math.cos(ry), rz = -Math.sin(ry);
        const hw = (e.panelW || PANEL_W) / 2, hh = (e.panelH || PANEL_H) / 2;
        // Ignore panels behind (or practically on) the camera: their projected
        // corners mirror across the screen and would match everything.
        if (new THREE.Vector3(cx, cy, cz).applyMatrix4(camera.matrixWorldInverse).z > -0.2) continue;
        const quad = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
            const v = new THREE.Vector3(
                cx + rx * sx * hw, cy + sy * hh, cz + rz * sx * hw
            ).project(camera);
            return [(v.x * 0.5 + 0.5) * window.innerWidth, (1 - (v.y * 0.5 + 0.5)) * window.innerHeight];
        });
        // Point in quad via consistent cross-product signs.
        let inside = true;
        for (let i = 0; i < 4; i++) {
            const a = quad[i], b = quad[(i + 1) % 4];
            const cross = (b[0] - a[0]) * (clientY - a[1]) - (b[1] - a[1]) * (clientX - a[0]);
            if (cross < 0) { inside = false; break; }
        }
        if (inside) return e;
    }
    return null;
};

// Layer for Twitch iframes: same z-index as the CSS3D overlay (2) but appended
// after it, so the video paints over the black shell while staying under the
// WebGL canvas (z-index 3). pointer-events stay off the layer itself; only the
// iframe's frame box accepts clicks.
function ensureTwitchLayer() {
    if (twitchLayer && twitchLayer.isConnected) return twitchLayer;
    twitchLayer = document.createElement('div');
    twitchLayer.id = 'twitch-layer';
    const s = twitchLayer.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.width = '100%';
    s.height = '100%';
    s.overflow = 'visible';
    s.pointerEvents = 'none';
    s.zIndex = '2';
    const gc = document.getElementById('game-container') || document.body;
    gc.appendChild(twitchLayer);
    return twitchLayer;
}

// Project the panel's four corners to screen space and map the 640x360 player
// onto that quad. The punched hole is the same perspective quad, so the picture
// sits exactly in the housing's screen opening: it turns and foreshortens with
// the prop instead of looking like an upright rectangle sliding behind a tilted
// window. The clip box is the quad's bounding box (also the click area).
function positionTwitchFrame(e) {
    const frame = e && e.twFrame;
    if (!frame || !e.mesh || typeof camera === 'undefined' || !camera) return false;
    const p = screenWorld(e);
    const ry = screenYaw(e);
    const forward = e.forward !== undefined ? e.forward : VIDEO_FORWARD;
    const panelY = e.panelY !== undefined ? e.panelY : PANEL_Y;
    const cx = p.x + Math.sin(ry) * forward;
    const cy = p.y + panelY;
    const cz = p.z + Math.cos(ry) * forward;
    if (new THREE.Vector3(cx, cy, cz).applyMatrix4(camera.matrixWorldInverse).z > -0.2) return false;
    const rx = Math.cos(ry), rz = -Math.sin(ry);
    const hw = (e.panelW || PANEL_W) / 2, hh = (e.panelH || PANEL_H) / 2;
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
        const v = new THREE.Vector3(
            cx + rx * sx * hw, cy + sy * hh, cz + rz * sx * hw
        ).project(camera);
        return [(v.x * 0.5 + 0.5) * window.innerWidth, (1 - (v.y * 0.5 + 0.5)) * window.innerHeight];
    });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of corners) {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
    }
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const s = frame.style;
    s.left = minX.toFixed(2) + 'px';
    s.top = minY.toFixed(2) + 'px';
    // The frame is the clipping/hit box: exactly the projected bounding box.
    s.width = w.toFixed(2) + 'px';
    s.height = h.toFixed(2) + 'px';
    // The player keeps a 640x360 layout (Twitch refuses autoplay below its
    // minimum size, and it measures the inner viewport) and is then mapped onto
    // the projected quad with a projective transform (homography). This is the
    // only mapping that makes the picture line up with the housing's opening at
    // any angle: a plain scale left the upright rectangle "rotating" inside the
    // tilted frame, and scaling the bounding box squashed or zoomed it.
    if (e.twVideoWrap) {
        // corners are TL, TR, BR, BL in viewport pixels; the element's own
        // origin is the clip box's top-left, so subtract it.
        const [TL, TR, BR, BL] = corners;
        const ax = TL[0] - minX, ay = TL[1] - minY;
        const bx = TR[0] - minX, by = TR[1] - minY;
        const gx = BR[0] - minX, gy = BR[1] - minY;
        const dx = BL[0] - minX, dy = BL[1] - minY;
        // Unit square -> quad, then fold the 640x360 element scale into it.
        const dx1 = bx - gx, dx2 = dx - gx, dx3 = ax - bx + gx - dx;
        const dy1 = by - gy, dy2 = dy - gy, dy3 = ay - by + gy - dy;
        const det = dx1 * dy2 - dx2 * dy1;
        let p = 0, q = 0;
        if (Math.abs(dx3) > 1e-8 || Math.abs(dy3) > 1e-8) {
            if (Math.abs(det) < 1e-8) return false;   // degenerate projection
            p = (dx3 * dy2 - dx2 * dy3) / det;
            q = (dx1 * dy3 - dx3 * dy1) / det;
        }
        const a = bx - ax + p * bx;
        const b = dx - ax + q * dx;
        const d = by - ay + p * by;
        const f2 = dy - ay + q * dy;
        const n = (v) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(6));
        e.twVideoWrap.style.transform = 'matrix3d(' + [
            n(a / 640), n(d / 640), '0', n(p / 640),
            n(b / 360), n(f2 / 360), '0', n(q / 360),
            '0', '0', '1', '0',
            n(ax), n(ay), '0', '1'
        ].join(',') + ')';
    }
    e.twitchReady = true;
    return true;
}

let twitchControlApi = null, twitchControlSerial = 0;
function loadTwitchControlApi(){
    if(window.Twitch?.Player)return Promise.resolve(window.Twitch);
    if(twitchControlApi)return twitchControlApi;
    twitchControlApi=new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='https://player.twitch.tv/js/embed/v1.js';script.async=true;
        script.onload=()=>window.Twitch?.Player?resolve(window.Twitch):reject(Error('Twitch controls unavailable'));
        script.onerror=()=>reject(Error('Twitch controls failed to load'));document.head.appendChild(script);
    }).catch(error=>{twitchControlApi=null;throw error;});
    return twitchControlApi;
}
function destroyTwitchControl(entry){
    entry.twitchControlMount=null;
    try{entry.twitchPlayer?.destroy?.();}catch(error){}
    entry.twitchPlayer=null;entry.twitchControlReady=false;entry.twitchResyncPending=false;
}
function resyncExistingTwitch(entry){
    // No supported live seek/rate control exists. Pause and same-channel reset
    // can revoke playback permission; leave playing/buffering viewers alone.
    if(!entry.twitchPlayer||!entry.twitchControlReady){entry.twitchResyncPending=true;return false;}
    try{
        if(entry.twitchPlayer.isPaused?.()===true)entry.twitchPlayer.play();
        entry.twitchResyncPending=false;return true;
    }catch(error){return false;}
}
window.playTwitchHere=function(propId=activeScreenId){
    const entry=getScreenEntry(propId);
    if(!entry?.twitchPlayer||!entry.twitchControlReady){showToast('Twitch is still loading. Try Play here once the player is ready.');return false;}
    // A direct local button gesture, rather than a delayed room relay.
    try{entry.twitchPlayer.play();return true;}catch(error){showToast('Use Play in the Twitch player to allow playback on this device.');return false;}
};
window.restartTwitchAtLive=function(propId=activeScreenId){
    const entry=getScreenEntry(propId);
    if(entry?.provider!=='twitch'||entry.data?.twitchKind!=='channel')return false;
    const now=Date.now();
    if(now-(entry.localLiveRestartAt??-Infinity)<5000){showToast('Wait a few seconds before restarting again.');return false;}
    entry.localLiveRestartAt=now;entry.restartLiveRequested=true;
    // Local only: a fresh channel player discards this viewer's DVR session.
    // Do not change the shared source, queue, timestamps, or anyone else's player.
    mountScreenContent(entry);
    showToast('Restarting this device at live. If Twitch blocks sound, playback will retry muted.');
    return true;
};
window.updateHouseLiveStream=function(id,stream){
    const entry=ytPlayers[id],src=screenSourceFromData(stream);
    if(!entry||entry.provider!=='twitch'||src?.provider!=='twitch'||src.twitchKind!=='channel'||entry.data.twitchKind!=='channel'||entry.data.twitchId!==src.id)return false;
    const changed=entry.data.startedAt!==stream.startedAt;
    Object.assign(entry.data,{startedAt:stream.startedAt,queue:Array.isArray(stream.queue)?stream.queue.slice():[]});
    if(changed)resyncExistingTwitch(entry);
    return true;
};
function mountTwitch(entry) {
    if (!entry || !entry.twVideoWrap) return;
    const restarting=entry.restartLiveRequested===true;entry.restartLiveRequested=false;
    // Only start with sound if the listener is already within earshot. A screen
    // seen from far away (or mounted after a deferred sound opt-in) must stay
    // muted; the proximity loop unmutes it on approach.
    const near = twitchListenerDistance(entry) <= TWITCH_AUDIO_OUT;
    entry.twFrame.style.display = 'block';
    entry.twitchAudioOn = !!entry.twitchUnmuted && near;
    entry.twitchFarMuted = !near;
    if (near) entry.twitchWasNear = true;
    const wrap=entry.twVideoWrap,token={};entry.twitchControlMount=token;
    loadTwitchControlApi().then(Twitch=>{
        if(entry.twitchControlMount!==token||entry.twVideoWrap!==wrap||!wrap.isConnected)return;
        const host=document.createElement('div');host.id='twitch-control-'+(++twitchControlSerial);host.style.pointerEvents='auto';wrap.appendChild(host);
        const options={width:640,height:360,parent:twitchParents(),autoplay:true,muted:!entry.twitchAudioOn};
        if(entry.data.twitchKind==='video')options.video='v'+entry.data.twitchId;else options.channel=entry.data.twitchId;
        const control=new Twitch.Player(host.id,options);entry.twitchPlayer=control;
        control.addEventListener(Twitch.Player.READY,()=>{
            if(entry.twitchControlMount!==token)return;
            entry.twitchControlReady=true;entry.iframe=host.querySelector('iframe');
            try{control.setMuted(!entry.twitchAudioOn);}catch(error){}
            if(restarting)try{control.play();}catch(error){}
            if(entry.twitchResyncPending)resyncExistingTwitch(entry);
        });
        if(restarting&&Twitch.Player.PLAYBACK_BLOCKED){
            let retried=false;
            control.addEventListener(Twitch.Player.PLAYBACK_BLOCKED,()=>{
                if(retried||entry.twitchControlMount!==token)return;retried=true;
                // Autoplay with sound can be denied on the replacement frame.
                // Retry muted once instead of leaving the tiny Play gate up.
                entry.twitchAudioOn=false;entry.twitchUnmuted=false;
                try{control.setMuted(true);control.play();}catch(error){}
                if(!entry.soundChip)addSoundChip(entry.twFrame,entry);
            });
        }
    }).catch(error=>{
        if(entry.twitchControlMount!==token||entry.twVideoWrap!==wrap)return;
        // Playback fallback only. Never replace an already playing fallback
        // iframe as part of a shared resync.
        const ifr=buildTwitchIframe(entry,!entry.twitchAudioOn);wrap.appendChild(ifr);entry.iframe=ifr;
        console.warn('Twitch interactive controls unavailable:',error);
    });
}

// Shared iframe construction so the unmute reload keeps every attribute.
function buildTwitchIframe(entry, mutedOverride) {
    const ifr = document.createElement('iframe');
    ifr.src = twitchEmbedUrl(entry, mutedOverride);
    ifr.title = 'Twitch stream';
    ifr.style.width = '100%';
    ifr.style.height = '100%';
    ifr.style.border = '0';
    ifr.style.display = 'block';
    ifr.style.pointerEvents = 'auto';
    ifr.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    ifr.setAttribute('allowfullscreen', '');
    ifr.setAttribute('frameborder', '0');
    ifr.setAttribute('scrolling', 'no');
    return ifr;
}

// Swap the embed for a fresh one with the wanted mute state. The player is
// cross-origin, so its audio cannot be faded from here: reloading a muted or
// unmuted embed is the only way to follow the listener's distance.
function swapTwitchIframe(entry) {
    if (!entry || !entry.twVideoWrap) return;
    if(entry.twitchPlayer){
        if(entry.twitchControlReady)try{entry.twitchPlayer.setMuted(!entry.twitchAudioOn);}catch(error){}
        entry.twitchSwapAt=Date.now();return;
    }
    const old = entry.iframe;
    const ifr = buildTwitchIframe(entry, !entry.twitchAudioOn);
    entry.twVideoWrap.appendChild(ifr);
    if (old) old.remove();
    entry.iframe = ifr;
    entry.twitchSwapAt = Date.now();
}

// Where the listener's ears are for screen audio: the player, not the camera
// (the third-person camera trails behind and can be much farther from a wall).
function twitchListenerDistance(e) {
    if (!e || !e.mesh) return 999;
    if (typeof player !== 'undefined' && player && player.position) {
        return player.position.distanceTo(screenWorld(e));
    }
    if (typeof camera !== 'undefined' && camera && camera.position) {
        return camera.position.distanceTo(screenWorld(e));
    }
    return 999;
}

// Enable sound through the player API (or the legacy fallback). A click in
// the top document), which is what browsers require before unmuted playback.
// If the listener is currently out of earshot we remember the opt-in but leave
// the embed muted; the proximity loop reloads it with sound on approach.
function unmuteTwitch(entry) {
    if (!entry || entry.twitchUnmuted) return;
    entry.twitchUnmuted = true;
    const near = twitchListenerDistance(entry) <= TWITCH_AUDIO_OUT;
    entry.twitchAudioOn = near;
    entry.twitchFarMuted = !near;
    if (near) entry.twitchWasNear = true;
    if (entry.soundChip) { entry.soundChip.remove(); entry.soundChip = null; }
    if(entry.twitchPlayer){
        if(entry.twitchControlReady)try{entry.twitchPlayer.setMuted(!entry.twitchAudioOn);if(near)entry.twitchPlayer.play();}catch(error){}
        return;
    }
    if (!entry.iframe || !near) return;
    entry.iframe.remove();
    const ifr = buildTwitchIframe(entry);
    entry.twVideoWrap.appendChild(ifr);
    entry.iframe = ifr;
}

// Mount a deferred Twitch player once its frame is really on screen.
function mountPendingTwitch(entry) {
    if (!entry || !entry.twitchPending) return;
    if (!entry.twitchReady || !entry.__shown) return;
    entry.twitchPending = false;
    if (!entry.iframe) mountTwitch(entry);
}

// Twitch audio lives inside the cross-origin embed, so distance has to be
// enforced through player controls: muted once past the voice range,
// unmuted again (if the player opted in with the SOUND chip) once they return.
// Separate in/out distances plus a short minimum interval stop it flapping when
// someone hovers at the boundary.
const TWITCH_AUDIO_OUT = (typeof MAX_VOICE_DISTANCE === 'number') ? MAX_VOICE_DISTANCE : 50;
const TWITCH_AUDIO_IN = TWITCH_AUDIO_OUT * 0.8;
function updateTwitchAudioRange(e) {
    if (!e || !e.iframe || e.twitchPending || !e.twitchReady) return;
    if (Date.now() - (e.twitchSwapAt || 0) < 800) return;
    if (typeof camera === 'undefined' || !camera || !camera.position) return;
    const dist = twitchListenerDistance(e);

    if (dist > TWITCH_AUDIO_OUT) {
        // Once the listener has been in earshot, force the embed back to muted
        // whenever they leave. This also covers a viewer who unmuted with
        // Twitch's own controls: that state is inside the cross-origin player
        // and cannot be read from here, so reload it muted instead of assuming
        // it is already silent.
        if (e.twitchWasNear && !e.twitchFarMuted) {
            e.twitchFarMuted = true;
            e.twitchAudioOn = false;
            swapTwitchIframe(e);
        }
        return;
    }

    if (dist <= TWITCH_AUDIO_OUT) e.twitchWasNear = true;

    // Only restore sound inside the tighter return radius. Without the opt-in
    // (SOUND chip) the embed simply stays muted.
    if (dist < TWITCH_AUDIO_IN && e.twitchFarMuted) {
        e.twitchFarMuted = false;
        if (e.twitchUnmuted) {
            e.twitchAudioOn = true;
            swapTwitchIframe(e);
        }
    }
}

// Small "sound" chip in the top-left corner of a Twitch screen. Beats relying
// on the player's own controls: this is our DOM, in the top document, so the
// click always reaches it and counts as a real user gesture.
function addSoundChip(shell, entry) {
    const chip = document.createElement('div');
    chip.textContent = '\u{1F50A} SOUND';
    chip.style.position = 'absolute';
    chip.style.left = '50%';
    chip.style.top = '10px';
    chip.style.transform = 'translateX(-50%)';
    chip.style.padding = '4px 10px';
    chip.style.background = 'rgba(10, 10, 14, 0.72)';
    chip.style.border = '1px solid rgba(255,255,255,0.35)';
    chip.style.borderRadius = '999px';
    chip.style.color = '#fff';
    chip.style.font = '700 14px/1.2 monospace';
    chip.style.letterSpacing = '0.06em';
    chip.style.cursor = 'pointer';
    chip.style.pointerEvents = 'auto';
    chip.style.zIndex = '11';
    chip.onclick = (ev) => {
        ev.stopPropagation();
        unmuteTwitch(entry);
    };
    shell.appendChild(chip);
    entry.soundChip = chip;
}

// Mount the actual YouTube player. Passed the DOM ELEMENT (not an id) so it
// works even when the CSS3D overlay restructures the tree.
function createYtPlayer(entry) {
    if (!entry || !entry.frameEl || !entry.frameEl.isConnected) {
        // Not in the document yet: retry shortly instead of silently failing.
        setTimeout(() => { if (ytPlayers[Object.keys(ytPlayers).find(k => ytPlayers[k] === entry)]) createYtPlayer(entry); }, 250);
        return;
    }
    try {
        const startSec = entry.data.paused?Math.max(0,Number(entry.data.pausedAt)||0):Math.max(0, Math.floor((Date.now() - entry.data.startedAt) / 1000));
        entry.player = new YT.Player(entry.frameEl, {
            videoId: entry.data.videoId,
            width: '1920',
            height: '1080',
            playerVars: {
                autoplay: 1,
                // Browsers block UNMUTED autoplay in cross-origin iframes, which
                // leaves the player stuck on its thumbnail (reads as "not
                // playing"). Start muted — always allowed — and let the
                // proximity loop unmute once someone is close enough.
                mute: 1,
                controls: 0,
                disablekb: 1,
                modestbranding: 1,
                rel: 0,
                playsinline: 1,
                fs: 0,
                iv_load_policy: 3,
                loop: 0
                // NOTE: no `start` here. On a live stream it makes YouTube jump
                // into the DVR window (i.e. "from the beginning") instead of the
                // live edge; the seek is applied in onReady for VODs only.
            },
            events: {
                onReady: (e) => {
                    try {
                        // Keep a 1080p iframe viewport, visually scaled to the
                        // existing 640×360 shell. YouTube controls adaptive quality.
                        const frame=e.target.getIframe();frame.style.width='1920px';frame.style.height='1080px';frame.style.transformOrigin='0 0';frame.style.transform='scale(0.3333333333)';
                        e.target.mute();
                        // Live streams report duration 0; never seek those.
                        // VODs seek to the shared wall-clock anchor so every
                        // viewer is in step.
                        let dur = 0;
                        try { dur = e.target.getDuration(); } catch (err) { }
                        if (dur && isFinite(dur) && dur > 0) {
                            entry.isLive = false;
                            const seekSec=entry.data.paused?Math.max(0,Number(entry.data.pausedAt)||0):Math.max(0,(Date.now()-entry.data.startedAt)/1000);
                            if (seekSec > 1||entry.data.paused) e.target.seekTo(seekSec, true);
                        } else {
                            entry.isLive = true;
                            entry.syncAt = null;   // anchor sync is meaningless live
                            entry.syncRecvAt = null;
                        }
                        if(entry.data.paused)e.target.pauseVideo();else e.target.playVideo();
                    } catch (err) { }
                },
                onError: () => {
                    // 101/150: the owner disabled embedding. Black screen is fine.
                    console.warn('[yt] embed rejected for', entry.data.videoId);
                },
                onStateChange: (e) => {
                    // 0 = ENDED: hand the screen to the next queue item. The
                    // host (or a single player) decides inside
                    // advanceScreenQueue; everyone else follows the ytChange
                    // broadcast that playScreenQueueIndex sends out.
                    if (e && e.data === 0 && !entry.data.paused) {
                        entry.ended = true;
                        try { entry.player.pauseVideo(); } catch (err) { }
                        const lid = entry.data && entry.data.id;
                        if (lid && ytSyncLoops[lid]) { clearInterval(ytSyncLoops[lid]); delete ytSyncLoops[lid]; }
                        setTimeout(() => advanceScreenQueue(lid), 500);
                    }
                }
            }
        });
        // Watchdog: some browsers mount but never start. If the state is still
        // unstarted/paused after 2.5s, nudge playback once. Also re-check the
        // live flag here: metadata can be missing at onReady, and treating a
        // VOD as live only means "no seek", which is harmless.
        setTimeout(() => {
            try {
                if (entry.ended||entry.data.paused) return;
                if (!entry.player || !entry.player.getPlayerState) return;
                const st = entry.player.getPlayerState();
                if (st === -1 || st === 2 || st === 5) entry.player.playVideo();
                if (entry.isLive === undefined) {
                    let d = 0;
                    try { d = entry.player.getDuration(); } catch (err) { }
                    entry.isLive = !(d && isFinite(d) && d > 0);
                }
            } catch (err) { }
        }, 2500);
    } catch (err) { /* leave black panel */ }
}

// Heartbeat the placer runs for each screen it placed. Broadcasts either
// directly (host) or up to the host, which relays (see handleDataFromClient).
function startYtSyncLoop(propData) {
    if (ytSyncLoops[propData.id]) return;
    ytSyncLoops[propData.id] = setInterval(() => {
        if (typeof isHost === 'undefined' && typeof player === 'undefined') return;
        const e = ytPlayers[propData.id];
        if (e && (e.ended||e.data.paused)) return;   // video finished: play once, no more sync
        // Detect end from player state too (onStateChange can be missed).
        if (e && e.player && typeof e.player.getPlayerState === 'function') {
            try { if (e.player.getPlayerState() === 0) { e.ended = true; try { e.player.pauseVideo(); } catch (err) {} if (ytSyncLoops[propData.id]) { clearInterval(ytSyncLoops[propData.id]); delete ytSyncLoops[propData.id]; } return; } } catch (err) { }
        }
        let at = (Date.now() - (e?.data?.startedAt??propData.startedAt)) / 1000;
        if (e && e.player && e.player.getCurrentTime) {
            try { at = e.player.getCurrentTime(); } catch (err) { }
        }
        // Live streams share the live edge implicitly; heartbeats would only
        // broadcast DVR-window times that receivers must ignore anyway.
        if (e && e.isLive) return;
        const msg = {
            type: 'ytSync',
            videoId:e?.data?.videoId||propData.videoId,
            propId: propData.id,
            at: Math.round((at || 0) * 10) / 10,
            ts: Date.now(),
            placer: String(myDeviceID || '')
        };
        if (typeof isHost !== 'undefined' && isHost) {
            broadcastToClients(msg);
        } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
            hostConn.send(msg);
        }
    }, 2000);
}

// Receiver side: apply a placer's heartbeat. Clock-skew immune because the
// target time is anchored to when THIS client received the packet.
function applyYtSync(data) {
    if (!data || data.type !== 'ytSync') return;
    // Ignore our own heartbeats.
    if (String(data.placer) === String(myDeviceID || '')) return;
    const e = ytPlayers[data.propId];
    if (!e) return;
    if(e.data?.paused)return;
    if (e.ended) return;   // already finished: don't seek/replay
    // Detect end from player state.
    if (e.player && typeof e.player.getPlayerState === 'function') {
        try { if (e.player.getPlayerState() === 0) { e.ended = true; return; } } catch (err) { }
    }
    e.syncAt = (Number(data.at) || 0);
    e.syncRecvAt = Date.now();
    if (e.player && e.player.getPlayerState) {
        try {
            // If the placer pressed pause/play, follow the state change too.
            if (e.player.getPlayerState() === 2) e.player.playVideo();
        } catch (err) { }
    }
}

// Per-frame tick, called from animate(). Position the DOM overlay on the
// screen mesh, resync drifted players (>=1.2s), and lace audio volume to
// proximity (same falloff as proximity voice).
const _screenWorld = new THREE.Vector3();
function screenWorld(e, out) {
    const v = out || _screenWorld;
    if (e && e.mesh) e.mesh.getWorldPosition(v);
    else v.set(0, 0, 0);
    return v;
}
// World screens put their picture on the mesh's -Z side (yawOffset PI); the
// house TV's screen faces +Z like the rest of the furniture (yawOffset 0).
function screenYaw(e) {
    const base = e && e.mesh ? e.mesh.rotation.y : 0;
    return base + (e && e.yawOffset !== undefined ? e.yawOffset : Math.PI);
}

window.tickYtScreens = function () {
    const indoor = !!(window.Housing && Housing.inside);
    for (const id in ytPlayers) {
        const e = ytPlayers[id];
        if (!e.mesh) continue;
        // Only the screens in the scene currently being rendered may be on
        // screen. The inactive environment's Twitch iframe is hidden so it
        // cannot float over the other scene.
        if (!!e.inHouse !== indoor) {
            if (e.twFrame) e.twFrame.style.display = 'none';
            // Silence the inactive environment. YouTube can be muted directly;
            // Twitch's embed owns its audio, so the proximity swap mutes it.
            if (e.provider === 'twitch') { try { updateTwitchAudioRange(e); } catch (err) { } }
            else { try { if (window.updateYtAudio) window.updateYtAudio(e); } catch (err) { } }
            e.__shown = false;
            continue;
        }
        if (e.twFrame) e.twFrame.style.display = '';
        if (e.cssObj) {
            // Panel sits relative to the housing mesh's world transform. The
            // video is nudged toward its readable side by its forward offset so
            // it sits just in front of the housing's face; punchScreens() stamps
            // the same plane out of the canvas alpha, and both must match.
            const p = screenWorld(e);
            const ry = screenYaw(e);
            const forward = e.forward !== undefined ? e.forward : VIDEO_FORWARD;
            const panelY = e.panelY !== undefined ? e.panelY : PANEL_Y;
            e.cssObj.position.set(
                p.x + Math.sin(ry) * forward,
                p.y + panelY,
                p.z + Math.cos(ry) * forward
            );
            e.cssObj.rotation.y = ry;
        }
        // Auto-advance queue when the current YouTube video has ended.
        if (!e.ended && !e.data.paused && e.player && typeof e.player.getPlayerState === 'function') {
            try {
                if (e.player.getPlayerState() === 0) {
                    e.ended = true;
                    try { e.player.pauseVideo(); } catch (err) { }
                    if (e.data && e.data.queue && e.data.queue.length > 0) {
                        setTimeout(() => advanceScreenQueue(id), 300);
                    }
                }
            } catch (err) { }
        }
        // One-sided panel: the picture only exists on the placer's side.
        if (e.provider === 'twitch') {
            try {
                const onScreen = positionTwitchFrame(e);
                updateScreenFacing(e);
                if (e.twFrame) {
                    // Never fade this layer: Chrome reports opacity:0 elements as
                    // not visible (IntersectionObserver v2), and Twitch latches its
                    // autoplay decision from that. When the camera is behind the
                    // panel the WebGL canvas simply isn't punched, so the housing
                    // covers the video anyway.
                    e.twFrame.style.opacity = '1';
                    const clickable = onScreen && !!e.__shown;
                    e.twFrame.style.pointerEvents = clickable ? 'auto' : 'none';
                }
                if (onScreen && e.__shown) mountPendingTwitch(e);
                updateTwitchAudioRange(e);
            } catch (err) { console.warn('[screen] Twitch update failed', err); }
            continue;   // no JS API: Twitch owns its audio
        }
        updateScreenFacing(e);
        try { window.updateYtAudio(e); } catch (err) { }
        try { window.tickYtSync(e, id); } catch (err) { }
    }
};

// Panel + video geometry, shared by the housing, the CSS3D overlay and the
// canvas-alpha punch below.
const PANEL_Y = 3.55, PANEL_W = 6.3, PANEL_H = 3.545;
// How far in front of the housing face the video plane sits. punchScreens()
// erases canvas pixels *behind* this plane, so the housing's own front face
// (which is 0.12 to 0.18 behind it) is punched out and the video shows there.
const VIDEO_FORWARD = 0.22;

// Show the video only from the front. tickYtScreens spins the CSS3D element by
// PI relative to the housing, so the picture's readable side is
// -(sin(rot), cos(rot)) world - which is also the side the placer stands on
// (the third-person camera sits behind the player). A small dead zone at the
// edge stops the picture flickering while someone walks around the side.
// Hiding also drops pointer events so the invisible panel cannot eat clicks.
function updateScreenFacing(e) {
    if (!e || !e.shell || !e.mesh) return;
    if (typeof camera === 'undefined' || !camera || !camera.position) return;
    const yaw = screenYaw(e);
    const p = screenWorld(e);
    const dx = camera.position.x - p.x;
    const dz = camera.position.z - p.z;
    const dot = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (e.__facing === undefined) e.__facing = dot >= 0;
    if (e.__facing && dot < -0.25) e.__facing = false;
    else if (!e.__facing && dot > 0.25) e.__facing = true;
    const show = e.__facing;
    if (e.__shown === show) return;
    e.__shown = show;
    // Use opacity, not visibility: hiding with visibility makes the browser
    // report the frame as hidden, which is exactly what Twitch's autoplay gate
    // looks for. The screen-space iframe layer is toggled the same way.
    e.shell.style.visibility = 'visible';
    e.shell.style.opacity = show ? '1' : '0';
    e.shell.style.pointerEvents = 'none';
}

// ---------------------------------------------------------------------------
// SCREEN DEPTH PUNCH
// ---------------------------------------------------------------------------
// The WebGL canvas is composited ABOVE the video DOM layer. After the world is
// drawn, each visible screen re-stamps its video rectangle into the alpha
// buffer: the depth test passes only where the scene's depth is FARTHER than
// the video plane, and those pixels are blended to zero alpha, so the browser
// shows the video underneath. Any geometry nearer than the plane (terrain,
// props, other players, sprites, particles) keeps its opaque pixels and
// therefore draws in front of the video - real occlusion, no per-object clones.
let punchScene = null;
let punchMesh = null;

function ensurePunchRig() {
    if (punchScene) return;
    punchScene = new THREE.Scene();
    const mat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessDepth,   // pass where the video plane is NEARER
        fog: false
    });
    // Erase (multiply the destination by zero) instead of drawing colour.
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.ZeroFactor;
    mat.blendDst = THREE.ZeroFactor;
    mat.blendEquation = THREE.AddEquation;
    punchMesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), mat);
    punchMesh.frustumCulled = false;
    punchScene.add(punchMesh);
}

// Called from animate() right after renderer.render(scene, camera).
window.punchScreens = function () {
    if (typeof renderer === 'undefined' || !renderer || !camera) return;
    const indoor = !!(window.Housing && Housing.inside);
    let anyVisible = false;
    for (const id in ytPlayers) {
        const e = ytPlayers[id];
        if (e && !!e.inHouse === indoor && e.__shown) { anyVisible = true; break; }
    }
    if (!anyVisible) return;
    ensurePunchRig();

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;      // keep the colour + depth buffers
    try {
        for (const id in ytPlayers) {
            const e = ytPlayers[id];
            if (!e || !e.mesh || !e.__shown || !!e.inHouse !== indoor) continue;
            try {
                const p = screenWorld(e);
                const ry = screenYaw(e);
                const panelY = e.panelY !== undefined ? e.panelY : PANEL_Y;
                const forward = e.forward !== undefined ? e.forward : VIDEO_FORWARD;
                punchMesh.scale.set((e.panelW || PANEL_W) / PANEL_W, (e.panelH || PANEL_H) / PANEL_H, 1);
                punchMesh.position.set(
                    p.x + Math.sin(ry) * forward,
                    p.y + panelY,
                    p.z + Math.cos(ry) * forward
                );
                punchMesh.rotation.y = ry;
                punchMesh.updateMatrixWorld(true);
                renderer.render(punchScene, camera);
            } catch (err) { console.warn('[screen] punch failed', id, err); }
        }
    } finally {
        renderer.autoClear = prevAutoClear;
    }
};

// Target YouTube volume (0-100) for a screen, from the listener's distance.
// Same ear point as the WebAudio listener above, and the same falloff as
// proximity voice. YouTube audio lives in its own iframe and bypasses the
// game's WebAudio master gain, so the Master and "Video Screens" sliders are
// applied here by hand.
function ytTargetVolume(e) {
    let dist = 999;
    if (typeof player !== 'undefined' && player && player.position && e.mesh) {
        dist = player.position.distanceTo(screenWorld(e));
    } else if (typeof camera !== 'undefined' && camera && e.mesh) {
        dist = camera.position.distanceTo(screenWorld(e));
    }
    const vol = Math.pow(Math.max(0, 1 - dist / MAX_VOICE_DISTANCE), 1.5);
    const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
    const master = (typeof saveState !== 'undefined') ? num(saveState.masterVolume, 1) : 1;
    const screen = (typeof saveState !== 'undefined') ? num(saveState.screenVolume, 1) : 1;
    return Math.round(vol * Math.max(0, Math.min(1, master * screen)) * 100);
}

// Browsers refuse to unmute cross-origin media before any user interaction.
// The game gets pointer/key events constantly, so this is where the autoplay
// unlock happens. IMPORTANT: only unlock when the listener is actually in
// earshot. Walking uses keydown events, and an unconditional unmute here used
// to switch a screen the player had walked away from straight back on at its
// old volume, making the distance mute look broken.
['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, () => {
        for (const id in ytPlayers) {
            const entry = ytPlayers[id];
            if (!entry || !entry.player) continue;
            if (ytTargetVolume(entry) <= 1) continue;
            try { window.updateYtAudio(entry); } catch (err) { }
        }
    }, true);
});

window.updateYtAudio = function (e) {
    if (!e.player) return;
    const volInt = ytTargetVolume(e);
    const p = e.player;
    if (!p.setVolume) return;
    try {
        // Keep the iframe's own volume in step even while muted, so an unmute
        // (ours or the browser's) can never blast audio from across the map.
        p.setVolume(volInt);
        if (volInt > 1) {
            if (p.isMuted && p.isMuted()) p.unMute();
        } else if (!p.isMuted || p.isMuted() === false) {
            p.mute();
        }
    } catch (err) { }
};

// Resync a drifted player (>= 1.2s off the anchor). Live streams are exempt:
// their timeline is the DVR window, so any seek would jump into the past.
window.tickYtSync = function (e, id) {
    if (!e.player || typeof camera === 'undefined') return;
    if(e.data?.paused){
        try{if(!e.isLive&&e.player.getCurrentTime&&Math.abs(e.player.getCurrentTime()-e.data.pausedAt)>.4)e.player.seekTo(e.data.pausedAt,true);if(e.player.getPlayerState?.()!==2)e.player.pauseVideo();}catch(error){}
        return;
    }

    if (e.isLive) {
        try {
            if (e.player.getPlayerState && e.player.getPlayerState() !== 1) e.player.playVideo();
        } catch (err) { }
        return;
    }

    if (!e.player.getCurrentTime) return;
    let target;
    if (e.syncAt !== null && e.syncRecvAt) {
        target = e.syncAt + (Date.now() - e.syncRecvAt) / 1000;
    } else {
        target = Math.max(0, (Date.now() - e.data.startedAt) / 1000);
    }
    if (!isFinite(target)) target = 0;
    let cur;
    try { cur = e.player.getCurrentTime(); } catch (err) { return; }
    if (isFinite(cur) && Math.abs(target - cur) > 1.2) {
        try { e.player.seekTo(Math.max(0, target), true); } catch (err) { }
    }
};

// ===========================================================================
// SCREEN: CHANGE VIDEO
// ---------------------------------------------------------------------------
// The placer (or the host) can swap the video on an existing screen. Everyone
// re-mounts in the same shell with a fresh shared anchor, so sync restarts
// cleanly. Late joiners are covered because the prop record (and myProps /
// activeProps on the host) is updated with the new videoId + startedAt.
// ===========================================================================
window.changeScreenVideo = function (propId) {
    const mesh = props[propId];
    const pd = mesh && mesh.userData && mesh.userData.propData;
    if (!pd || pd.type !== 'screen') return;

    const me = String(typeof myDeviceID !== 'undefined' && myDeviceID ? myDeviceID : '');
    const isPlacer = String(pd.placer || '') === me;
    if (!isPlacer) {
        showToast('Only the player who placed this screen can change it.', 'error');
        return;
    }

    const url = window.prompt('Paste a new YouTube or Twitch URL for this screen:', '');
    if (!url) return;
    const src = parseScreenSource(String(url).trim());
    if (!src) { showToast('Use a real YouTube or Twitch link (youtube.com, youtu.be, twitch.tv).', 'error'); return; }

    const msg = {
        type: 'ytChange',
        propId: propId,
        provider: src.provider,
        videoId: src.provider === 'youtube' ? src.id : null,
        twitchId: src.provider === 'twitch' ? src.id : null,
        twitchKind: src.provider === 'twitch' ? src.twitchKind : null,
        startedAt: Date.now(),
        placer: me
    };

    // Update our own record first, then tell the room.
    pd.provider = src.provider;
    if (src.provider === 'youtube') {
        pd.videoId = src.id;
        pd.twitchId = null; pd.twitchKind = null;
    } else {
        pd.twitchId = src.id;
        pd.twitchKind = src.twitchKind;
        pd.videoId = null;
    }
    pd.startedAt = msg.startedAt;
    window.applyYtChange(msg);

    if (typeof isHost !== 'undefined' && isHost) {
        if (myProps.some(p => p.id === propId)) {
            const rec = myProps.find(p => p.id === propId);
            rec.provider = src.provider;
            if (src.provider === 'youtube') {
                rec.videoId = src.id;
                rec.twitchId = null; rec.twitchKind = null;
            } else {
                rec.twitchId = src.id;
                rec.twitchKind = src.twitchKind;
                rec.videoId = null;
            }
            rec.startedAt = msg.startedAt;
        }
        broadcastToClients(msg);
    } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
        hostConn.send(msg);
    }
};

// Receiver side: swap the video in place (shell + CSS3D object are reused).
window.applyYtChange = function (data) {
    if (!data || data.type !== 'ytChange' || !data.propId) return;
    const id = data.propId;
    const e = ytPlayers[id];
    if (!e) return; // no screen with this id here

    const src = screenSourceFromData(data);
    if (!src) return;

    const keepLivePlayer=e.provider==='twitch'&&src.provider==='twitch'&&src.twitchKind==='channel'&&e.data?.twitchKind==='channel'&&e.data?.twitchId===src.id;

    e.provider = src.provider;
    // Keep the prop id and the queue: dropping them here used to blank every
    // receiver's queue panel after a video change and desync index-based
    // removes. A queue snapshot on the message (sent by playScreenQueueIndex)
    // is authoritative; otherwise keep what we had.
    const prevQueue = (e.data && Array.isArray(e.data.queue)) ? e.data.queue : [];
    e.data = {
        id: id,
        provider: src.provider,
        videoId: src.provider === 'youtube' ? src.id : null,
        twitchId: src.provider === 'twitch' ? src.id : null,
        twitchKind: src.provider === 'twitch' ? src.twitchKind : null,
        queue: Array.isArray(data.queue) ? data.queue.slice() : prevQueue,
        startedAt: data.startedAt || Date.now(),
        paused:false,pausedAt:0,
        placer: data.placer || (e.data && e.data.placer) || ''
    };
    for(const list of [typeof myProps!=='undefined'?myProps:[],typeof activeProps!=='undefined'?activeProps:[]]){const record=list.find(p=>p.id===id);if(record){record.paused=false;record.pausedAt=0;}}
    if(typeof props!=='undefined'&&props[id]?.userData?.propData){props[id].userData.propData.paused=false;props[id].userData.propData.pausedAt=0;}
    e.syncAt = null;
    e.syncRecvAt = null;
    e.isLive = undefined;   // re-detect for the new video
    e.ended = false;
    e.__advAt = 0;
    // Rebuilds the shell contents for whichever provider is now active.
    if(keepLivePlayer)resyncExistingTwitch(e);else mountScreenContent(e);
    if (activeScreenId === id && typeof renderScreenQueue === 'function') renderScreenQueue();
};

// --- STREAM QUEUE (appended) ---
let activeScreenId = null;

window.toggleScreenQueue = function (propId) {
    if (propId) activeScreenId = propId;
    const ui = document.getElementById('screen-queue-overlay');
    if (!ui) return;
    const opening = ui.style.display !== 'flex';
    ui.style.display = opening ? 'flex' : 'none';
    if (opening) {
        if (typeof document.exitPointerLock === 'function') document.exitPointerLock();
        renderScreenQueue();
    }
};

function getScreenEntry(propId) {
    return (typeof ytPlayers !== 'undefined' && ytPlayers[propId]) || null;
}

function validateScreenPlaybackRequest(data,clientId,records){
    if(!data||typeof clientId!=='string'||!clientId||typeof data.paused!=='boolean'||!Number.isFinite(data.at)||data.at<0||data.at>1e7)return null;
    const record=records.find(p=>p.id===data.propId);
    if(!record||record.type!=='screen'||record.owner!==clientId||record.provider!=='youtube'||record.videoId!==data.videoId)return null;
    const clean={type:'ytPlayback',propId:record.id,videoId:record.videoId,paused:data.paused,at:data.at,startedAt:Date.now()-data.at*1000};
    Object.assign(record,{paused:clean.paused,pausedAt:clean.at,startedAt:clean.startedAt});return clean;
}
function canPauseScreen(entry){
    if(!entry?.data||entry.data.provider!=='youtube'||!entry.data.videoId)return false;
    if(entry.isHouse)return entry.houseOwnerLocal===true;
    const device=typeof myDeviceID!=='undefined'?String(myDeviceID||''):'';
    return !!device&&String(entry.data.placer||'')===device;
}
function applyScreenPlayback(data){
    if(!data||typeof data.paused!=='boolean'||!Number.isFinite(data.at)||data.at<0||data.at>1e7)return false;
    const entry=getScreenEntry(data.propId);
    if(!entry?.data||entry.data.provider!=='youtube'||entry.data.videoId!==data.videoId)return false;
    const state={paused:data.paused,pausedAt:data.at,startedAt:Number.isFinite(data.startedAt)?data.startedAt:Date.now()-data.at*1000};
    Object.assign(entry.data,state);entry.syncAt=data.at;entry.syncRecvAt=Date.now();entry.ended=false;
    if(typeof props!=='undefined'&&props[data.propId]?.userData?.propData)Object.assign(props[data.propId].userData.propData,state);
    for(const list of [typeof myProps!=='undefined'?myProps:[],typeof activeProps!=='undefined'?activeProps:[]]){
        const record=list.find(p=>p.id===data.propId);if(record)Object.assign(record,state);
    }
    try{if(entry.player){if(!entry.isLive&&entry.player.seekTo)entry.player.seekTo(data.at,true);if(data.paused)entry.player.pauseVideo();else entry.player.playVideo();}}catch(error){}
    if(typeof activeScreenId!=='undefined'&&activeScreenId===data.propId&&typeof renderScreenQueue==='function')renderScreenQueue();
    return true;
}
window.toggleScreenPause=function(propId=activeScreenId){
    const entry=getScreenEntry(propId);
    if(!canPauseScreen(entry)){showToast('Only the owner can pause or resume this screen.','error');return false;}
    const paused=entry.data.paused!==true;let at=entry.data.paused===true?entry.data.pausedAt:Math.max(0,(Date.now()-entry.data.startedAt)/1000);
    if(entry.data.paused!==true)try{if(entry.player?.getCurrentTime)at=entry.player.getCurrentTime();}catch(error){}
    at=Math.max(0,Math.min(1e7,Number(at)||0));
    const message={type:'ytPlayback',propId,videoId:entry.data.videoId,paused,at,startedAt:Date.now()-at*1000};
    if(!applyScreenPlayback(message))return false;
    if(entry.isHouse){if(typeof entry.houseSync==='function')entry.houseSync(entry.data);}
    else if(typeof isHost!=='undefined'&&isHost)broadcastToClients(message);
    else if(typeof hostConn!=='undefined'&&hostConn?.open)hostConn.send(message);
    return true;
};
function canResyncLiveScreen(entry){
    if(entry?.data?.provider!=='twitch'||entry.data.twitchKind!=='channel'||!entry.data.twitchId)return false;
    return entry.isHouse?entry.houseOwnerLocal===true:!!String(typeof myDeviceID!=='undefined'?myDeviceID||'':'')&&String(entry.data.placer||'')===String(myDeviceID);
}
window.resyncScreenToLive=function(propId=activeScreenId){
    const entry=getScreenEntry(propId);
    if(!canResyncLiveScreen(entry)){showToast('Only the owner can resync a Twitch live screen.','error');return false;}
    const now=Date.now();
    if(now-(entry.liveResyncRequestedAt??-Infinity)<10000){showToast('Wait a few seconds before resyncing again.');return false;}
    const hosting=typeof isHost!=='undefined'&&isHost;
    if(!entry.isHouse&&!hosting&&!(typeof hostConn!=='undefined'&&hostConn?.open)){showToast('Reconnect to the lobby before resyncing.','error');return false;}
    if(entry.isHouse&&typeof entry.houseSync!=='function')return false;
    entry.liveResyncRequestedAt=now;
    // The validated owner-only path resumes paused viewers on the same channel.
    // It cannot align live timestamps and must never reset a playing viewer.
    const message={type:'ytChange',propId,provider:'twitch',videoId:null,twitchId:entry.data.twitchId,twitchKind:'channel',startedAt:now,placer:entry.data.placer};
    if(entry.isHouse){
        entry.data.startedAt=now;entry.data.paused=false;entry.data.pausedAt=0;
        resyncExistingTwitch(entry);entry.houseSync(entry.data);
    }else if(hosting){
        window.applyYtChange(message);
        for(const list of [typeof myProps!=='undefined'?myProps:[],typeof activeProps!=='undefined'?activeProps:[]]){
            const record=list.find(p=>p.id===propId);if(record)record.startedAt=now;
        }
        broadcastToClients(message);
    }else{
        // Wait for the host relay so the owner does not reload twice.
        hostConn.send(message);
    }
    showToast('Requested live playback recovery. Playing viewers are unchanged; Twitch controls live delay.');
    return true;
};
function renderScreenPauseControl(entry){
    const button=document.getElementById('screen-pause-button'),status=document.getElementById('screen-playback-status');
    if(!button)return;const available=entry?.data?.provider==='youtube'&&!!entry.data.videoId,owner=canPauseScreen(entry);
    button.hidden=!available;button.disabled=!owner;button.textContent=entry?.data?.paused?'Resume video':'Pause video';button.setAttribute('aria-pressed',String(entry?.data?.paused===true));
    if(status)status.textContent=available?((entry.data.paused?'Paused':'Playing')+(owner?'':' · Only the owner can pause or resume.')):'';
    const resync=document.getElementById('screen-resync-live');
    const live=entry?.data?.provider==='twitch'&&entry.data.twitchKind==='channel';
    if(resync){resync.hidden=!live;resync.disabled=!canResyncLiveScreen(entry);resync.textContent='Resume live for room';}
    const localPlay=document.getElementById('screen-play-live');
    if(localPlay)localPlay.hidden=!live;
    const restart=document.getElementById('screen-restart-live');
    if(restart)restart.hidden=!live;
    if(live&&status)status.textContent='Restart at live opens a fresh stream on this device only, discarding your rewind position. Play here only resumes. Live buffering can differ.';
}

function renderScreenQueue() {
    const list = document.getElementById('screen-queue-list');
    if (!list || !activeScreenId) return;
    const entry = getScreenEntry(activeScreenId);
    const pd = entry ? entry.data : null;
    renderScreenPauseControl(entry);
    const queue = (pd && Array.isArray(pd.queue)) ? pd.queue : [];
    const isOwner = entry ? (entry.isHouse ? !!entry.houseOwnerLocal : (!!pd && (String(pd.placer || '') === String(myDeviceID || '') || (typeof isHost !== 'undefined' && isHost)))) : false;
    const input = document.getElementById('screen-queue-input');
    const addBtn = document.getElementById('screen-queue-add');
    if (input) { input.disabled = false; input.placeholder = 'Paste YouTube/Twitch URL'; }
    if (addBtn) { addBtn.disabled = false; addBtn.style.opacity = '1'; }
    const subtitle = document.querySelector('#screen-queue-overlay .overlay-subtitle');
    if (subtitle) subtitle.textContent = entry && entry.isHouse ? 'Add videos; the house owner controls playback.' : "Add videos; the screen's owner controls playback.";
    list.innerHTML = '';
    if (queue.length === 0) {
        const empty = document.createElement('div');
        empty.style.color = 'var(--p-text-dim)';
        empty.innerText = 'Queue is empty. Add a video above.';
        list.appendChild(empty);
        return;
    }
    queue.forEach((q, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; border:1px solid var(--p-line); background:var(--p-face-2);';
        const label = document.createElement('span');
        const title = q.title || q.id;
        const who = q.addedBy ? (' (added by ' + q.addedBy + ')') : '';
        label.innerText = (q.provider === 'youtube' ? 'YT' : 'TW') + ': ' + title + who;
        row.appendChild(label);
        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '4px';
        // Playback is owner-only: only the placer (or the host) gets the Play
        // button. Everyone else just watches and follows the owner's changes.
        if (isOwner) {
            const upBtn = document.createElement('button');
            upBtn.className = 'btn-sm'; upBtn.innerText = '↑';
            upBtn.onclick = () => moveScreenQueue(activeScreenId, idx, -1);
            const downBtn = document.createElement('button');
            downBtn.className = 'btn-sm'; downBtn.innerText = '↓';
            downBtn.onclick = () => moveScreenQueue(activeScreenId, idx, 1);
            const playBtn = document.createElement('button');
            playBtn.className = 'btn-sm';
            playBtn.innerText = 'Play';
            playBtn.onclick = () => playScreenQueueIndex(activeScreenId, idx);
            btns.appendChild(upBtn);
            btns.appendChild(downBtn);
            btns.appendChild(playBtn);
        }
        if (isOwner) {
            const rmBtn = document.createElement('button');
            rmBtn.className = 'btn-sm';
            rmBtn.innerText = 'Remove';
            rmBtn.onclick = () => removeFromScreenQueue(activeScreenId, idx);
            btns.appendChild(rmBtn);
        }
        row.appendChild(btns);
        list.appendChild(row);
    });
}
window.refreshScreenQueue = renderScreenQueue;
window.closeScreenQueue = function () {
    const ui = document.getElementById('screen-queue-overlay');
    if (ui && ui.style.display === 'flex') window.toggleScreenQueue();
};

window.addScreenQueueFromInput = async function () {
    const src = (typeof parseScreenSource === 'function') ? parseScreenSource(String((document.getElementById('screen-queue-input') || {}).value || '').trim()) : null;
    if (!src) { showToast('Use a real YouTube/Twitch link.', 'error'); return; }
    if (!activeScreenId) { showToast('No screen selected.', 'error'); return; }
    await addToScreenQueue(activeScreenId, src);
    const input = document.getElementById('screen-queue-input');
    if (input) input.value = '';
    renderScreenQueue();
};

async function addToScreenQueue(propId, src) {
    let title = null;
    if (src.provider === 'youtube') title = await fetchYtTitle(src.id);
    const entry = getScreenEntry(propId);
    if (!entry || !entry.data) return;
    if (!Array.isArray(entry.data.queue)) entry.data.queue = [];
    // addedBy is the DISPLAY name (myDeviceID is an opaque dev-xxxx id, which
    // is what used to show up as a row of numbers in the queue panel).
    const myName = (typeof saveState !== 'undefined' && saveState && saveState.displayName)
        ? String(saveState.displayName) : 'Fisher';
    if(entry.data.queue.length>=50){showToast('A screen queue can hold at most 50 videos.');return;}
    const item = { provider: src.provider, id: src.id, twitchKind: src.twitchKind || null, title: typeof title==='string'?title.slice(0,500):null, addedBy: myName };
    entry.data.queue.push(item);
    if (entry.isHouse) {
        if (entry.houseOwnerLocal) {
            const idle = !entry.data.provider && !entry.data.videoId && !entry.data.twitchId;
            if (idle) playScreenQueueIndex(propId, entry.data.queue.length - 1);
            else if (typeof entry.houseSync === 'function') entry.houseSync(entry.data);
        } else {
            // Guests may queue videos, exactly like the outdoor stream player.
            // Only the owner can start playback; the owner's house:update then
            // brings the authoritative queue back to everyone.
            const msg = { type: 'screenQueueAdd', propId: propId, item: item, placer: String(myDeviceID || '') };
            if (typeof isHost !== 'undefined' && isHost) broadcastToClients(msg);
            else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) hostConn.send(msg);
        }
        renderScreenQueue();
        return;
    }
    const msg = { type: 'screenQueueAdd', propId: propId, item: item, placer: String(myDeviceID || '') };
    if (typeof isHost !== 'undefined' && isHost) {
        broadcastToClients(msg);
    } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
        hostConn.send(msg);
    }
    // Nothing playing yet (fresh screen): start the new video right away so
    // the queue is hands-off from the first add. Only the host or a single
    // player triggers it — a regular client's ytChange would be rejected by
    // the host's ownership check, leaving the adder out of step. Client adds
    // are started by the host when it relays the screenQueueAdd.
    const idle = !entry.data.provider && !entry.data.videoId && !entry.data.twitchId;
    if (idle && ((typeof isHost !== 'undefined' && isHost) || !(typeof hostConn !== 'undefined' && hostConn))) {
        playScreenQueueIndex(propId, entry.data.queue.length - 1);
    }
}

function fetchYtTitle(id) {
    return fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&format=json')
        .then(r => r.ok ? r.json() : null)
        .then(d => (d && d.title) ? d.title : null)
        .catch(() => null);
}

function moveScreenQueue(propId, idx, dir) {
    const entry = getScreenEntry(propId);
    if (!entry || !entry.data || !Array.isArray(entry.data.queue)) return;
    if (entry.isHouse && !entry.houseOwnerLocal) return;
    const q = entry.data.queue;
    const ni = idx + dir;
    if (ni < 0 || ni >= q.length) return;
    const tmp = q[idx]; q[idx] = q[ni]; q[ni] = tmp;
    if (entry.isHouse) {
        if (typeof entry.houseSync === 'function') entry.houseSync(entry.data);
        renderScreenQueue();
        return;
    }
    const msg = { type: 'screenQueueMove', propId: propId, from: idx, to: ni, placer: String(myDeviceID || '') };
    if (typeof isHost !== 'undefined' && isHost) broadcastToClients(msg);
    else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) hostConn.send(msg);
    renderScreenQueue();
}

function removeFromScreenQueue(propId, idx) {
    const entry = getScreenEntry(propId);
    if (!entry || !entry.data || !Array.isArray(entry.data.queue)) return;
    if (entry.isHouse && !entry.houseOwnerLocal) return;
    if (idx < 0 || idx >= entry.data.queue.length) return;
    entry.data.queue.splice(idx, 1);
    entry.data.paused=false;entry.data.pausedAt=0;
    if (entry.isHouse) {
        if (typeof entry.houseSync === 'function') entry.houseSync(entry.data);
        renderScreenQueue();
        return;
    }
    const msg = { type: 'screenQueueRemove', propId: propId, idx: idx, placer: String(myDeviceID || '') };
    if (typeof isHost !== 'undefined' && isHost) {
        broadcastToClients(msg);
    } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
        hostConn.send(msg);
    }
    renderScreenQueue();
}

function playScreenQueueIndex(propId, idx) {
    const entry = getScreenEntry(propId);
    if (!entry || !entry.data || !Array.isArray(entry.data.queue)) return;
    if (idx < 0 || idx >= entry.data.queue.length) return;
    // Playback control is owner-only: the screen's placer, the host (room
    // authority — its auto-advance and idle-start also come through here), or
    // anyone in single-player. House TVs use the local house owner instead.
    if (entry.isHouse) {
        if (!entry.houseOwnerLocal) {
            showToast('Only the house owner can control this TV.', 'error');
            return;
        }
    } else {
        const singlePlayer = (typeof isHost === 'undefined' || (!isHost && !hostConn));
        const isPlacer = String(entry.data.placer || '') === String(myDeviceID || '');
        if (!singlePlayer && !(typeof isHost !== 'undefined' && isHost) && !isPlacer) {
            showToast('Only the player who placed this screen can play from its queue.', 'error');
            return;
        }
    }
    const q = entry.data.queue[idx];
    const src = { provider: q.provider, id: q.id, twitchKind: q.twitchKind };
    entry.data.queue.splice(idx, 1);
    entry.provider = src.provider;
    entry.data.provider = src.provider;
    entry.data.videoId = src.provider === 'youtube' ? src.id : null;
    entry.data.twitchId = src.provider === 'twitch' ? src.id : null;
    entry.data.twitchKind = src.provider === 'twitch' ? src.twitchKind : null;
    entry.data.startedAt = Date.now();
    entry.syncAt = null;
    entry.syncRecvAt = null;
    entry.ended = false;
    entry.__advAt = 0;
    if (typeof mountScreenContent === 'function') mountScreenContent(entry);
    if (entry.isHouse) {
        if (typeof entry.houseSync === 'function') entry.houseSync(entry.data);
        renderScreenQueue();
        return;
    }
    // The post-splice queue rides along so receivers splice the same item out
    // (their local queues would otherwise keep it and index-based removes
    // would drift out of alignment).
    const msg = { type: 'ytChange', propId: propId, provider: src.provider, videoId: entry.data.videoId, twitchId: entry.data.twitchId, twitchKind: entry.data.twitchKind, startedAt: entry.data.startedAt, queue: entry.data.queue.slice(), placer: String(myDeviceID || '') };
    if (typeof isHost !== 'undefined' && isHost) {
        broadcastToClients(msg);
        // Keep the authoritative records (late joiners rebuild screens from
        // these via allProps) in step with what is now playing.
        [myProps, activeProps].forEach(function (list) {
            if (!Array.isArray(list)) return;
            const rec = list.find(function (p) { return p.id === propId; });
            if (!rec || rec === entry.data) return;
            rec.provider = src.provider;
            rec.videoId = entry.data.videoId;
            rec.twitchId = entry.data.twitchId;
            rec.twitchKind = entry.data.twitchKind;
            rec.startedAt = entry.data.startedAt;
            rec.queue = entry.data.queue.slice();
            rec.paused=false;rec.pausedAt=0;
        });
    } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
        hostConn.send(msg);
    }
    // Placement never carries a source any more, so the sync heartbeat has to
    // be (re)started when a YouTube video actually starts. The placer or the
    // host owns it; the loop itself refuses to double-start.
    if (src.provider === 'youtube' && typeof startYtSyncLoop === 'function') {
        const isPlacer = entry.data.placer === String(myDeviceID || '');
        if ((typeof isHost !== 'undefined' && isHost) || isPlacer || !hostConn) {
            startYtSyncLoop({ id: propId, startedAt: entry.data.startedAt });
        }
    }
    renderScreenQueue();
}

// Auto-advance the queue when the current YouTube video ends. The ENDED
// event in createYtPlayer and the tick-based detection in tickYtScreens can
// BOTH schedule this for the same end, so __advAt collapses them into one
// advance. Only the host or a single player advances; the rest of the room
// follows the ytChange broadcast that playScreenQueueIndex sends.
function advanceScreenQueue(propId) {
    const entry = getScreenEntry(propId);
    if (!entry || !entry.data || entry.data.paused || !Array.isArray(entry.data.queue) || entry.data.queue.length === 0) return;
    if (entry.isHouse) {
        if (!entry.houseOwnerLocal) return;
    } else {
        // Allow advancement in single-player (no host) too.
        const singlePlayer = (typeof isHost === 'undefined' || (!isHost && !hostConn));
        if (typeof isHost !== 'undefined' && !isHost && !singlePlayer) return;
    }
    const now = Date.now();
    if (entry.__advAt && now - entry.__advAt < 4000) return;
    entry.__advAt = now;
    playScreenQueueIndex(propId, 0);
}
// Prop sync over P2P is handled in ui.js (handleDataFromClient / handleDataFromHost),
// which processes propPlaced / propRemoved / allProps. Nothing to hook here.

