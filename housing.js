// Personal houses. Interiors are separate scenes; ownership and visit grants
// are checked by the lobby host, never inferred from a client's coordinates.
(function () {
    'use strict';
    if(!window.Furniture){console.error('Housing requires furniture.js; reload the game to finish updating.');return;}
    const ORIGIN = 30000;
    const defaults = { version: 1, name: 'My house', wall: '#eadac4', floor: '#b0825e', trim: '#714933', furniture: [] };
    const color = (value, fallback) => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    const bounded = (v, min, max) => Math.max(min, Math.min(max, typeof v==='number' && Number.isFinite(v) ? v : 0));
    function normalize(data) {
        data = data && typeof data === 'object' ? data : {};
        const furniture=window.Furniture?Furniture.normalizeLayout(data.furniture, data):[];
        return {
            version: 1, sizeTier: Furniture.sizeTier(data), name: (typeof data.name==='string' && data.name.trim() ? data.name : defaults.name).replace(/[\x00-\x1f]/g, '').slice(0, 40),
            wall: color(data.wall, defaults.wall), floor: color(data.floor, defaults.floor), trim: color(data.trim, defaults.trim),
            furniture,
            collections: Array.isArray(data.collections)?[...new Set(data.collections.filter(id=>Furniture.collections.some(v=>v.id===id)))]:[],
            presets: (Array.isArray(data.presets)?data.presets:[]).slice(0,5).filter(v=>v&&typeof v.name==='string').map(v=>{
                const clean=normalize({...v,presets:[],collections:[],inventory:[]});
                return {name:v.name.slice(0,32),sizeTier:clean.sizeTier,wall:clean.wall,floor:clean.floor,trim:clean.trim,furniture:clean.furniture.map(item=>{const copy={...item};delete copy.stream;delete copy.displayCatch;delete copy.displayOwned;return copy;})};
            }),
            inventory: window.Furniture ? Furniture.normalizeInventory(data.inventory, furniture) : []
        };
    }
    function savePreset(house,name){
        if((house.presets||[]).length>=5)return {ok:false,error:'Delete a preset before saving another (maximum 5).'};
        if(typeof name!=='string'||!name.trim())return {ok:false,error:'Give your preset a name.'};
        const clean=normalize(house),preset={name:name.trim().slice(0,32),sizeTier:clean.sizeTier,wall:clean.wall,floor:clean.floor,trim:clean.trim,furniture:clean.furniture.map(item=>{const copy={...item};delete copy.stream;return copy;})};
        return {ok:true,house:normalize({...clean,presets:[...clean.presets,preset]})};
    }
    function restorePreset(house,index){
        const preset=house.presets?.[index];if(!preset)return {ok:false,error:'Preset not found.'};
        const owned=new Map([...house.furniture,...house.inventory].map(v=>[v.id,v]));
        const furniture=[];
        for(const item of preset.furniture){const current=owned.get(item.id);if(!current||current.type!==item.type)return {ok:false,error:'Some furniture in this preset is no longer owned.'};const placed={...item};delete placed.displayCatch;delete placed.displayOwned;if(current.displayCatch)placed.displayCatch=current.displayCatch;if(current.displayOwned)placed.displayOwned=true;if(current.stream)placed.stream=current.stream;furniture.push(placed);owned.delete(item.id);}
        const inventory=[...owned.values()];if(inventory.length>Furniture.STORAGE_LIMIT)return {ok:false,error:'Make more storage space before loading this preset.'};
        const result=normalize({...house,wall:preset.wall,floor:preset.floor,trim:preset.trim,furniture,inventory});
        if(result.furniture.length!==furniture.length)return {ok:false,error:'This preset does not fit the current interior.'};
        return {ok:true,house:result};
    }
    // Saved TVs start idle after a page reload. Normalization of live house
    // updates deliberately preserves playback so current-session visitors sync.
    function restoreSave(data) {
        const house = normalize(data);
        for (const item of [...house.furniture, ...house.inventory]) {
            if (Furniture.isScreenType(item.type)) delete item.stream;
            if(item.displayCatch&&!item.displayOwned){delete item.displayCatch;delete item.displayOwned;}
        }
        return house;
    }
    function housePosition(pos, house) {
        const size = Furniture.roomSize(house), halfX = size.width / 2 - .55, halfZ = size.depth / 2 - .55;
        return !!pos && [pos.x, pos.y, pos.z].every(Number.isFinite) && Math.abs(pos.x - ORIGIN) <= halfX + .2 && Math.abs(pos.z - ORIGIN) <= halfZ + .2 && pos.y >= -.5 && pos.y <= 15;
    }

    function diffHouse(before, after) {
        const old=new Map((before?.furniture||[]).map(v=>[v.id,JSON.stringify(v)]));
        const current=new Set(after.furniture.map(v=>v.id));
        return { meta: { version:after.version,name:after.name,sizeTier:after.sizeTier,wall:after.wall,floor:after.floor,trim:after.trim },
            upsert:after.furniture.filter(v=>old.get(v.id)!==JSON.stringify(v)),remove:[...old.keys()].filter(id=>!current.has(id)) };
    }
    function applyHousePatch(house, patch) {
        if(!patch || !Array.isArray(patch.upsert)||!Array.isArray(patch.remove)||patch.upsert.length>280||patch.remove.length>280)return house;
        const remove=new Set(patch.remove), items=new Map(house.furniture.filter(v=>!remove.has(v.id)).map(v=>[v.id,v]));
        for(const item of patch.upsert)if(item&&typeof item.id==='string')items.set(item.id,item);
        return normalize({...house,...patch.meta,furniture:[...items.values()],inventory:[]});
    }
    // Pure host-side protocol, also used by the multiplayer regression tests.
    class HouseRouter {
        constructor(env) { this.env = env; this.pending = new Map(); this.access = new Map(); this.lastRequest = new Map(); this.houses = new Map(); this.queuedUpdates=new Map();this.lastPublish=new Map(); this.serial = 0; }
        prune() {
            for(const [owner,house] of this.queuedUpdates)if(this.env.now()-(this.lastPublish.get(owner)||0)>=250){this.queuedUpdates.delete(owner);this.publish(owner,house);}
            for (const [id, request] of this.pending) if (this.env.now() >= request.until) {
                this.pending.delete(id);
                this.env.deliver(request.from, { type: 'house:denied', requestId: id, reason: 'The visit request expired.' });
                this.env.deliver(request.owner, { type: 'house:cancelRequest', requestId: id });
            }
        }
        publish(from, raw) {
            const house=normalize(raw);house.inventory=[];this.lastPublish.set(from,this.env.now());this.houses.set(from,house);
            for(const [guest,grant] of this.access)if(grant.owner===from){
                const patch=diffHouse(grant.house,house);
                if(patch.upsert.length||patch.remove.length||JSON.stringify(patch.meta)!==JSON.stringify(diffHouse(grant.house,grant.house).meta))this.env.deliver(guest,{type:'house:update',owner:from,patch});
                grant.house=house;
            }
        }
        receive(from, message) {
            if (!message || typeof message.type !== 'string') return;
            this.prune();
            if (message.type === 'house:request') {
                const owner = typeof message.owner==='string' ? message.owner.slice(0,255) : '';
                if (owner === from || !this.env.online(from) || !this.env.online(owner)) return this.env.deliver(from, { type: 'house:denied', reason: 'That player is no longer in the lobby.' });
                const last = this.lastRequest.get(from);
                if (last !== undefined && this.env.now() - last < 3000) return;
                this.lastRequest.set(from, this.env.now());
                if ([...this.pending.values()].some(v => v.from === from)) return;
                const id = 'visit-' + (++this.serial) + '-' + this.env.now();
                this.pending.set(id, { from, owner, until: this.env.now() + 45000 });
                this.env.deliver(from,{type:'house:pending',requestId:id,owner});
                this.env.deliver(owner, { type: 'house:request', requestId: id, requester: from, name: String(this.env.name(from) || 'Player').slice(0, 40), expiresAt: this.env.now() + 45000 });
                return;
            }
            if (message.type === 'house:decision') {
                const request = this.pending.get(message.requestId);
                if (!request || request.owner !== from) return;
                this.pending.delete(message.requestId);
                if (!message.accept || !this.env.online(request.from)) return this.env.deliver(request.from, { type: 'house:denied', requestId: message.requestId, reason: 'The owner declined your visit.' });
                this.houses.set(from, normalize(message.house));
                const token = this.env.token();
                this.access.set(request.from, { owner: from, token, house:normalize(message.house) });
                this.queuedUpdates.delete(from);
                this.env.deliver(request.from, { type: 'house:grant', requestId: message.requestId, owner: from, token, house: normalize(message.house) });
                return;
            }
            if(message.type==='house:cancel'){for(const [id,request] of this.pending)if(request.from===from){this.pending.delete(id);this.env.deliver(request.owner,{type:'house:cancelRequest',requestId:id});}return;}
            if (message.type === 'house:leave') { this.access.delete(from); return; }
            if (message.type === 'house:kick') {
                const grant = this.access.get(message.guest);
                if (!grant || grant.owner !== from) return;
                this.access.delete(message.guest);
                this.env.deliver(message.guest, { type: 'house:ejected', reason: 'The owner ended your visit.' });
                return;
            }
            if (message.type === 'house:update') {
                if(!this.env.online(from))return;
                if(this.lastPublish.has(from)&&this.env.now()-this.lastPublish.get(from)<250){this.queuedUpdates.set(from,message.house);return;}
                this.publish(from,message.house);
            }
        }
        allowed(from, payload) {
            if (!housePosition(payload && payload.pos, this.houses.get(payload && payload.houseOwner))) return false;
            if (payload.houseOwner === from) return true;
            const grant = this.access.get(from);
            return !!grant && this.env.online(grant.owner) && payload.houseOwner === grant.owner && payload.houseToken === grant.token;
        }
        disconnect(id) {
            this.access.delete(id); this.lastRequest.delete(id); this.houses.delete(id);this.queuedUpdates.delete(id);this.lastPublish.delete(id);
            for (const [guest, grant] of this.access) if (grant.owner === id) {
                this.access.delete(guest); this.env.deliver(guest, { type: 'house:ejected', reason: 'The house owner left the lobby.' });
            }
            for (const [key, request] of this.pending) if (request.from === id || request.owner === id) {
                this.pending.delete(key);
                this.env.deliver(request.from === id ? request.owner : request.from, { type: 'house:denied', requestId: key, reason: 'The other player left the lobby.' });
            }
        }
    }
    window.HouseProtocol = { savePreset, restorePreset, HouseRouter, diffHouse, applyHousePatch, normalize, restoreSave, housePosition, ORIGIN };

    const entrances = new Set();
    const MAX_HOUSE_TVS = 2;
    const houseScreenIds = new Set();
    let active = null, router = null, routerOwner = '', nearby = null, nextTick = 0;
    let modal = null, modalBody = null, modalTitle = null, status = null, visiting = null, pendingUntil = 0, layout = null;
    const requests = new Map();
    const me = () => String((typeof myPeerId !== 'undefined' && myPeerId) || (typeof myDeviceID !== 'undefined' && myDeviceID) || 'local');
    const online = id => id === me() || !!(typeof otherPlayers !== 'undefined' && otherPlayers[id]);
    function houseSave() { saveState.house = normalize(saveState.house); return saveState.house; }
    function hostRouter() {
        if (!router || routerOwner !== me()) {
            routerOwner = me();
            router = new HouseRouter({ now: Date.now, online, name: id => id === me() ? saveState.displayName : otherPlayers[id] && otherPlayers[id].lastData.name,
                token: () => { const values = new Uint32Array(4); crypto.getRandomValues(values); return Array.from(values, v => v.toString(16)).join('-'); }, deliver });
        }
        return router;
    }
    function deliver(id, message) {
        if (id === me()) receive(message);
        else if (typeof clientConns !== 'undefined' && clientConns[id] && clientConns[id].open) clientConns[id].send(message);
    }
    function send(message) {
        if(message.house)message={...message,house:{...message.house,presets:[],inventory:[]}};
        if (typeof isHost !== 'undefined' && isHost) hostRouter().receive(me(), message);
        else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) hostConn.send(message);
        else if (message.type === 'house:request') showToast('House visits require an online lobby.');
    }
    function receive(message) {
        if(message.type==='house:pending'){if(visiting&&visiting.owner===message.owner)visiting.requestId=message.requestId;return;}
        if (message.type === 'house:request') {
            if (requests.size >= 5) { send({ type: 'house:decision', requestId: message.requestId, accept: false }); return; }
            requests.set(message.requestId, message); showRequest();
        } else if (message.type === 'house:grant') {
            if (!visiting || visiting.owner !== message.owner || visiting.requestId!==message.requestId || !online(message.owner)) return;
            if(!nearby){visiting=null;closeModal();send({type:'house:leave'});showToast('Return to a house entrance to request another visit.');return;}
            visiting = null; pendingUntil = 0; closeModal(); enter(message.owner, message.house, message.token);
        } else if (message.type === 'house:denied') {
            visiting = null; pendingUntil = 0; requests.delete(message.requestId);
            if (modal && ['request','waiting'].includes(modal.dataset.page)) closeModal();
            showToast(message.reason || 'Visit declined.');
        } else if (message.type === 'house:cancelRequest') {
            requests.delete(message.requestId); if (modal && modal.dataset.page === 'request') { closeModal(); showRequest(); }
        } else if (message.type === 'house:ejected') {
            visiting = null; if (active && active.owner !== me()) leave(); showToast(message.reason || 'Your visit ended.');
        } else if (message.type === 'house:update' && active && active.owner === message.owner) {
            const oldSize=active.house.sizeTier;
            const oldLayout=JSON.stringify(active.house.furniture);
            active.house = message.patch ? applyHousePatch(active.house,message.patch) : normalize(message.house);
            if(oldSize!==active.house.sizeTier) { rebuildRoom(); return; }
            applyColors();
            if(oldLayout!==JSON.stringify(active.house.furniture))renderFurniture();
        }
    }
    function ensureUI() {
        if (modal) return;
        const style=document.createElement('style');style.textContent=`
            #house-menu > div {overflow-x:hidden!important;overscroll-behavior:contain;min-width:0;}
            #house-menu .house-shop-shell > div {min-width:0;max-width:100%;}
            #house-menu button {min-width:0;max-width:100%;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;}
            #house-menu canvas {max-width:100%;box-sizing:border-box;}
            #house-menu select {max-width:100%;min-width:0;box-sizing:border-box;}
            #house-menu .house-mode-tabs {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:10px;}
            #house-menu .house-mode-tabs button,#house-menu .house-category-tabs button {margin:0;padding:9px 6px;font-size:11px;letter-spacing:.03em;}
            #house-menu .house-category-tabs {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-bottom:10px;}
            #house-menu button[aria-selected="true"] {background:var(--p-face-3,#52626b);border-color:var(--p-gold,#e2c07a);color:var(--p-gold,#e2c07a);}
            #house-menu .house-item-list {display:flex;flex-direction:column;gap:8px;max-height:min(42vh,380px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;padding:2px 6px 6px 2px;box-sizing:border-box;}
            #house-menu .house-item-preview {order:-1;flex:0 0 88px;width:88px;height:72px;object-fit:contain;background:#172329;border:1px solid var(--p-line,#678);border-radius:4px;pointer-events:none;}
            #house-menu .house-item-list > * {flex-shrink:0;}
            #house-menu .house-item-list button {margin:0;width:100%;padding:12px 10px;text-align:left;}
        `;document.body.appendChild(style);
        modal = document.createElement('div'); modal.className = 'overlay-screen'; modal.id = 'house-menu'; modal.style.zIndex = '10020';
        const panel = document.createElement('div'); panel.style.cssText = 'width:min(90vw,460px);max-height:80vh;overflow:auto;background:var(--p-face,#242c34);border:2px solid var(--p-line,#678);padding:24px;box-sizing:border-box;color:var(--p-text,#fff)';
        modalTitle = document.createElement('h2'); panel.appendChild(modalTitle);
        modalBody = document.createElement('div'); modalBody.style.cssText = 'display:flex;flex-direction:column;gap:12px'; panel.appendChild(modalBody);
        const close = document.createElement('button'); close.className = 'btn-lg'; close.textContent = 'Close'; close.style.marginTop = '18px'; close.onclick = () => { closeModal(); showRequest(); }; panel.appendChild(close);
        modal.appendChild(panel); document.body.appendChild(modal);
        status = document.createElement('div'); status.id = 'house-status'; status.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:1500;display:none;gap:8px;align-items:center;background:var(--p-face,#242c34);color:var(--p-text,#fff);padding:8px 12px;border:2px solid var(--p-line,#678)';
        document.body.appendChild(status);
        document.addEventListener('keydown', event => {
            if(modal.dataset.page==='furniture'&&modal.style.display==='flex'&&event.code==='KeyR'&&!['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)rotateFurniture();return;}
            if(event.code==='Escape'&&layout&&layout.pending&&modal.style.display==='flex'){event.preventDefault();event.stopImmediatePropagation();layout.pending=null;paintFurnitureUI();return;}
            if (event.code === 'Escape' && modal.style.display === 'flex') { event.preventDefault(); event.stopImmediatePropagation(); closeModal(); showRequest(); }
        }, true);
    }
    function openModal(title, page) {
        ensureUI(); if(page!=='furniture')layout=null;modal.firstElementChild.style.width='min(90vw,460px)';modal.firstElementChild.style.maxHeight='80vh';modalTitle.textContent = title; modalBody.replaceChildren(); modal.dataset.page = page; modal.style.display = 'flex';
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        if (typeof controls !== 'undefined') { controls.forward = controls.backward = controls.left = controls.right = controls.jump = false; }
    }
    function closeModal() { layout=null; if(modal&&modal.dataset.page==='waiting'&&visiting){visiting=null;pendingUntil=0;send({type:'house:cancel'});} if (modal) { modal.style.display = 'none'; modal.dataset.page = ''; } }
    function button(text, callback, parent = modalBody) { const b = document.createElement('button'); b.className = 'btn-lg'; b.textContent = text; b.onclick = callback; parent.appendChild(b); return b; }
    function text(message) { const p = document.createElement('p'); p.textContent = message; modalBody.appendChild(p); }
    function showRequest() {
        if (!requests.size || modal && modal.style.display === 'flex') return;
        const [id, request] = requests.entries().next().value;
        if (request.expiresAt <= Date.now()) { requests.delete(id); return showRequest(); }
        openModal('House visit request', 'request'); text(request.name + ' would like to visit your house.');
        const decide = accept => { requests.delete(id); send({ type: 'house:decision', requestId: id, accept, house: accept ? {...houseSave(),inventory:[]} : undefined }); closeModal(); showRequest(); };
        button('Accept visit', () => decide(true)); button('Decline', () => decide(false));
    }
    function openEntrance() {
        if (!nearby || !player || active) return;
        openModal('Enter house', 'entrance');
        button('Enter your house', () => { closeModal(); enter(me(), houseSave(), ''); });
        button('Enter other players house', showPlayers);
    }
    function showPlayers() {
        openModal('Choose a player’s house', 'players');
        const peers = Object.keys(otherPlayers || {}).filter(id => id !== me());
        if (!peers.length) text('No other players are in this lobby.');
        for (const id of peers) {
            const data = otherPlayers[id].lastData || {};
            button(data.name || 'Player', () => {
                if (visiting) return showToast('A visit request is already pending.');
                visiting = { owner: id }; pendingUntil = Date.now() + 45000;
                openModal('Visit requested', 'waiting'); text('Waiting for the house owner to accept your request.');
                send({ type: 'house:request', owner: id });
            });
        }
        button('Back', openEntrance);
    }
    function editHouse() {
        if (!active || active.owner !== me()) return;
        openModal('Customize your house', 'customize');
        const label = document.createElement('label'); label.textContent = 'House name';
        const input = document.createElement('input'); input.type = 'text'; input.maxLength = 40; input.value = active.house.name; label.appendChild(input); modalBody.appendChild(label);
        const fields = {};
        for (const [key, name] of [['wall', 'Wall color'], ['floor', 'Floor color'], ['trim', 'Trim color']]) {
            const row = document.createElement('label'); row.textContent = name + ' '; const field = document.createElement('input'); field.type = 'color'; field.value = active.house[key]; row.appendChild(field); modalBody.appendChild(row); fields[key] = field;
        }
        button('Save house', () => {
            saveState.house = normalize({ ...active.house, name: input.value, wall: fields.wall.value, floor: fields.floor.value, trim: fields.trim.value });
            active.house = normalize(saveState.house); applyColors(); saveGame(); send({ type: 'house:update', house: {...saveState.house,inventory:[]} }); closeModal(); showToast('House saved.');
        });
        const size = Furniture.roomSize(active.house), next = Furniture.ROOM_SIZES[Furniture.sizeTier(active.house)+1];
        text('Interior: '+size.name+' · '+size.width+' × '+size.depth+'. Exterior size stays the same.');
        if (next) {
            const upgrade = button('Upgrade interior: '+next.width+' × '+next.depth+' — $'+next.price.toLocaleString(), () => {
                if (commitFurniture(Furniture.upgradeHouse(active.house, saveState.money))) { editHouse(); showToast('Interior expanded! Saved and synced to visitors.'); }
            });
            upgrade.disabled = saveState.money < next.price;
        } else text('Your interior is fully upgraded.');
        button('Build rooms & furniture',openFurniture);
        button('Fishing collections',openCollections);
        button('Saved house layouts',openPresets);
        text('Buy Room walls and Open doorways in the furniture store to build rooms. Interior upgrades, furniture, colors and your house name save on this browser and sync to approved visitors.');
        const guests = Object.keys(otherPlayers).filter(id => otherPlayers[id].lastData.houseOwner === me());
        for (const id of guests) button('End visit: ' + (otherPlayers[id].lastData.name || 'Player'), () => { send({ type: 'house:kick', guest: id }); editHouse(); });
    }
    function openCollections(){
        if(!active||active.owner!==me())return;openModal('Fishing collections','collections');
        text('Each completed set unlocks a free exclusive furniture piece and a title. Your fishing journal includes past catches.');
        for(const entry of Furniture.collectionProgress(active.house,saveState.journal)){
            text(entry.name+' · '+entry.count+'/'+entry.fish.length+' · '+entry.fish.join(', '));
            text('Reward: '+Furniture.byId[entry.reward].name+' + collector title');
            const claim=button(entry.claimed?'Claimed':'Claim '+entry.name,()=>{
                const result=Furniture.claimCollection(active.house,saveState.journal,entry.id);
                if(commitFurniture(result)){if(!saveState.unlockedTitles.includes(result.title))saveState.unlockedTitles.push(result.title);saveGame();openCollections();showToast('Collection reward unlocked! Equip your title in the cosmetic shop.');}
            });claim.disabled=entry.claimed||entry.count<entry.fish.length;
        }
        button('Back',editHouse);
    }
    function openPresets(){
        if(!active||active.owner!==me())return;openModal('Saved house layouts','presets');
        text('Save up to 5 layouts. Loading rearranges items you own and stores unused pieces. It does not buy or duplicate furniture.');
        const name=document.createElement('input');name.maxLength=32;name.placeholder='Layout name';modalBody.appendChild(name);
        button('Save current layout',()=>{if(commitFurniture(savePreset(active.house,name.value)))openPresets();});
        active.house.presets.forEach((preset,index)=>{
            text(preset.name+' · '+preset.furniture.length+' placed pieces');
            button('Load '+preset.name,()=>{const result=restorePreset(active.house,index);if(result.ok&&result.house.furniture.some(item=>Furniture.collisionRects(item).some(rect=>Furniture.overlap(rect,{x:player.position.x-ORIGIN,z:player.position.z-ORIGIN,w:.7,d:.7}))))return showToast('Move to a clear spot before loading this layout.');if(commitFurniture(result)){applyColors();openPresets();}});
            button('Delete '+preset.name,()=>{if(commitFurniture({ok:true,house:{...active.house,presets:active.house.presets.filter((v,i)=>i!==index)}}))openPresets();});
        });button('Back',editHouse);
    }
    function editFurnitureItem(){
        if(!active||active.owner!==me())return;
        const item=active.house.furniture.find(v=>v.id===layout?.selected);if(!item)return showToast('Select a placed item first.');
        openModal('Customize '+Furniture.byId[item.type].name,'item');
        const paint=document.createElement('input');paint.type='color';paint.value=item.color||Furniture.byId[item.type].color;modalBody.appendChild(paint);
        button('Apply color',()=>{if(Furniture.isRoomPiece(item.type))return showToast('Use house wall and trim colors for room pieces.');if(commitFurniture({ok:true,house:{...active.house,furniture:active.house.furniture.map(v=>v.id===item.id?{...v,color:paint.value}:v)}}))showToast('Furniture color saved.');});
        if(['aquarium','catch_plaque'].includes(item.type))text('Walk up to this display and press your interact key to change the catch.');
        button('Back',openFurniture);
    }
    function nearestDisplay(){
        if(!active)return null;let result=null,distance=2.6;
        for(const item of active.house.furniture){if(!['aquarium','catch_plaque'].includes(item.type))continue;const pose=Furniture.resolve(active.house.furniture,item),d=Math.hypot(player.position.x-ORIGIN-pose.x,player.position.z-ORIGIN-pose.z);if(d<distance){distance=d;result=item;}}
        return result;
    }
    function commitCatchTransfer(result){
        if(!active||active.owner!==me())return false;
        if(!result.ok){showToast(result.error);return false;}
        const previous=saveState.inventory;saveState.inventory=result.fishInventory;
        if(!commitFurniture(result)){saveState.inventory=previous;return false;}
        if(Array.isArray(saveState.invSlots)){
            const other=saveState.invSlots.filter(v=>v&&v.type!=='fish'),counts=new Map();
            for(const fish of saveState.inventory){const row=counts.get(fish.name)||{type:'fish',name:fish.name,color:fish.color,size:fish.size||1,count:0};row.count++;counts.set(fish.name,row);}
            saveState.invSlots=[...other,...counts.values()].slice(0,50);while(saveState.invSlots.length<50)saveState.invSlots.push(null);
        }
        if(typeof updateInventory==='function')updateInventory();saveGame();return true;
    }
    function openCatchDisplay(){
        const item=nearestDisplay();if(!item)return;openModal('Catch display','display');
        text(item.displayCatch?item.displayCatch.name+' · '+(item.displayCatch.rarity||'Unknown rarity')+' · '+(item.displayCatch.tierName||'Normal')+' · size '+item.displayCatch.size+' · '+item.displayCatch.zone+' · $'+(item.displayCatch.price||0).toLocaleString():'No catch displayed yet.');
        if(active.owner===me()){
            text('Select a fish you currently own. It moves from your inventory into this display. Replacing or clearing the display returns its current fish.');
            const select=document.createElement('select');const fish=saveState.inventory.filter(v=>v&&v.name&&v.name!=='Old Boot');
            fish.forEach((caught,index)=>{const option=document.createElement('option');option.value=index;option.textContent=caught.name+' · size '+(caught.size||1);select.appendChild(option);});modalBody.appendChild(select);
            const put=button('Display selected catch',()=>{const caught=fish[Number(select.value)],index=saveState.inventory.indexOf(caught);if(index<0)return showToast('That fish is no longer in your inventory. Reopen this display.');if(commitCatchTransfer(Furniture.transferCatch(active.house,saveState.inventory,item.id,index))){openCatchDisplay();showToast('Fish moved into display.');}});put.disabled=!fish.length;
            button('Return fish to inventory',()=>{if(commitCatchTransfer(Furniture.transferCatch(active.house,saveState.inventory,item.id))){openCatchDisplay();showToast('Displayed fish returned to inventory.');}});
            if(item.displayCatch)text(item.displayCatch.name+' · size '+item.displayCatch.size+' · '+item.displayCatch.zone);
        }

        button('Close',closeModal);
    }
    function displayPrompt(prompt,action){
        const item=nearestDisplay();if(!item)return false;
        const tv=nearestTv();if(tv){const a=Furniture.resolve(active.house.furniture,item),b=Furniture.resolve(active.house.furniture,tv),x=player.position.x-ORIGIN,z=player.position.z-ORIGIN;if(Math.hypot(x-b.x,z-b.z)<Math.hypot(x-a.x,z-a.z))return false;}
        interactTarget='house-display';
        if(prompt){prompt.textContent='PRESS '+String(saveState.keybinds.interact||'KeyE').replace('Key','')+' TO '+(active.owner===me()?'CHANGE':'VIEW')+' CATCH DISPLAY';prompt.style.display='block';}
        if(action)action.textContent='DISPLAY';return true;
    }
    function clearHouseScreens() {
        for (const id of houseScreenIds) if (window.removeScreenById) window.removeScreenById(id);
        houseScreenIds.clear();
    }
    function renderFurniture() {
        if (!active || !window.Furniture) return;
        let group=active.room.getObjectByName('houseFurnitureGroup');
        if(!group){group=new THREE.Group();group.name='houseFurnitureGroup';group.position.set(ORIGIN,.005,ORIGIN);active.room.add(group);}
        const rugOrder=new Map(active.house.furniture.filter(v=>Furniture.byId[v.type].rug).map(v=>v.id).sort().map((id,i)=>[id,i+1]));
        const desired=new Set(active.house.furniture.map(v=>v.id));
        const removeScreen=id=>{const screen='house-tv-'+id;if(houseScreenIds.has(screen)){if(window.removeScreenById)window.removeScreenById(screen);houseScreenIds.delete(screen);}};
        for(const mesh of [...group.children])if(!desired.has(mesh.userData.furnitureId)){removeScreen(mesh.userData.furnitureId);group.remove(mesh);disposeRoom(mesh);}
        const meshes=new Map(group.children.map(mesh=>[mesh.userData.furnitureId,mesh]));
        for (const item of active.house.furniture) {
            const pose = Furniture.resolve(active.house.furniture, item);
            const geometryKey=JSON.stringify([item.type,item.length,item.color,item.displayCatch,(Furniture.isRoomPiece(item.type)||Furniture.wallFriendly(item.type)||Furniture.byId[item.type].wall)?[item.x,item.z,item.rot,active.house.sizeTier]:null]);
            let mesh=meshes.get(item.id);
            if(mesh&&mesh.userData.geometryKey!==geometryKey){removeScreen(item.id);group.remove(mesh);disposeRoom(mesh);mesh=null;}
            if(!mesh){mesh=Furniture.makeMesh(item.type,active.house,item);mesh.userData.geometryKey=geometryKey;group.add(mesh);}
            if(Furniture.byId[item.type].rug){mesh.material.polygonOffset=true;mesh.material.polygonOffsetFactor=-1;mesh.material.polygonOffsetUnits=-2*rugOrder.get(item.id);mesh.renderOrder=rugOrder.get(item.id);}
            const screenKey=JSON.stringify([pose,item.stream]);
            mesh.position.set(pose.x, pose.y, pose.z); mesh.rotation.y = pose.rot; mesh.userData.furnitureId = item.id; group.add(mesh);
            if (Furniture.isScreenType(item.type) && window.attachHouseTv && mesh.userData.screenKey!==screenKey) {
                // A same-channel live resync changes the stream timestamp, not
                // the TV. Preserve the viewer's player and playback permission.
                let previousPose=null;try{previousPose=JSON.parse(mesh.userData.screenKey||'null')?.[0];}catch(error){}
                if(JSON.stringify(previousPose)===JSON.stringify(pose)&&window.updateHouseLiveStream?.('house-tv-'+item.id,item.stream)){
                    mesh.userData.screenKey=screenKey;continue;
                }
                removeScreen(item.id);mesh.userData.screenKey=screenKey;
                const screenId = 'house-tv-' + item.id;
                const sync = data => {
                    if (!active || active.owner !== me()) return;
                    const current = active.house.furniture.find(v => v.id === item.id);
                    if (!current) return;
                    current.stream = {
                        provider: data.provider || null,
                        videoId: data.videoId || null,
                        twitchId: data.twitchId || null,
                        twitchKind: data.twitchKind || null,
                        startedAt: data.startedAt || Date.now(),
                        paused:data.paused===true,pausedAt:Math.max(0,Number(data.pausedAt)||0),
                        queue: (Array.isArray(data.queue) ? data.queue : []).map(q => ({ provider: q.provider, id: q.id, twitchKind: q.twitchKind || null, title: q.title || '', addedBy: q.addedBy || '' }))
                    };
                    saveState.house = normalize(active.house); active.house = saveState.house;
                    const playing=active.house.furniture.find(v=>v.id===item.id);
                    if(playing)mesh.userData.screenKey=JSON.stringify([Furniture.resolve(active.house.furniture,playing),playing.stream]);
                    saveGame();
                    send({ type: 'house:update', house: { ...saveState.house, inventory: [] } });
                };
                try { window.attachHouseTv(screenId, item, mesh, active.owner, active.owner === me(), sync); houseScreenIds.add(screenId); }
                catch (e) { console.warn('House TV failed to mount', e); }
            }
        }
        active.blockers = active.house.furniture.flatMap(item=>Furniture.walkSurfaces(active.house.furniture,item));
        active.room.add(group);
        if (window.refreshScreenQueue) window.refreshScreenQueue();
    }
    function commitFurniture(result) {
        if (!active || active.owner !== me()) return false;
        if (!result.ok) { showToast(result.error); return false; }
        const resized = active.house.sizeTier !== Furniture.sizeTier(result.house);
        const changed = resized || JSON.stringify(active.house.furniture) !== JSON.stringify(result.house.furniture);
        saveState.house = normalize(result.house); active.house = normalize(saveState.house);
        if (result.money !== undefined) saveState.money = result.money;
        if (resized) rebuildRoom(); else if (changed) renderFurniture();
        saveGame(); if (typeof updateUI === 'function') updateUI();
        if (changed) send({ type: 'house:update', house: { ...saveState.house, inventory: [] } });
        return true;
    }
    function openFurniture() {
        if (!active || active.owner !== me()) return;
        openModal('Build rooms & furniture', 'furniture');
        layout = { selected: null, pending: null, hover: null, surface: 'auto', tab: 'rooms', doorSide: 'front', draft: null };
        paintFurnitureUI();
    }
    function nearestTv() {
        if (!active) return null;
        let best = null, bestDistance = 2.6;
        for (const item of active.house.furniture) {
            if (!Furniture.isScreenType(item.type)) continue;
            const pose = Furniture.resolve(active.house.furniture, item);
            const distance = Math.hypot(player.position.x - (ORIGIN + pose.x), player.position.z - (ORIGIN + pose.z));
            if (distance < bestDistance) { bestDistance = distance; best = item; }
        }
        return best;
    }
    function openHouseTv() {
        const item = nearestTv();
        if (!item) return;
        if (window.toggleScreenQueue) window.toggleScreenQueue('house-tv-' + item.id);
        else showToast('Stream player is not available.');
    }
    // A guest can add to a house TV queue from the same Stream Queue overlay.
    // The host relays screenQueueAdd; the house owner persists it and sends the
    // authoritative house snapshot back to every visitor.
    function addHouseTvQueue(data) {
        if (!data || typeof data.propId !== 'string' || !data.propId.startsWith('house-tv-') || !data.item) return false;
        const ownActive = !!active && active.owner === me();
        const id = data.propId.slice('house-tv-'.length);
        const house = ownActive ? active.house : saveState.house;
        if (!house || !Array.isArray(house.furniture)) return false;
        const tv = house.furniture.find(v => v.id === id && v.type === 'stream_tv');
        if (!tv) return false;
        const stream = tv.stream && typeof tv.stream === 'object'
            ? JSON.parse(JSON.stringify(tv.stream))
            : { provider: null, videoId: null, twitchId: null, twitchKind: null, startedAt: Date.now(), queue: [] };
        if (!Array.isArray(stream.queue)) stream.queue = [];
        if(stream.queue.length>=50)return false;
        stream.queue.push(data.item);
        const normalized = Furniture.normalizeStream(stream);
        if (!normalized) return false;
        tv.stream = normalized;
        if (ownActive) { active.house = normalize(active.house); saveState.house = active.house; }
        else saveState.house = normalize(saveState.house);
        saveGame();
        send({ type: 'house:update', house: { ...saveState.house, inventory: [] } });
        return true;
    }
    function startPlacement(id, moving) {
        const item = (moving ? active.house.furniture : active.house.inventory).find(v => v.id === id);
        if (!item) return;
        if (!moving && Furniture.isScreenType(item.type) && active.house.furniture.filter(v => Furniture.isScreenType(v.type)).length >= MAX_HOUSE_TVS) {
            showToast('A house can have at most ' + MAX_HOUSE_TVS + ' stream TVs.');
            return;
        }
        const pose = moving ? Furniture.resolve(active.house.furniture, item) : { rot: 0 };
        layout.selected = moving ? id : null;
        layout.pending = { id, type: item.type, moving, rot: pose.rot, length: Furniture.wallLength(item) }; layout.surface = 'auto'; layout.wall = item.wall || 'back'; layout.hover = null;
        paintFurnitureUI();
    }
    function placementAt(point) {
        if (!layout || !layout.pending || !point) return null;
        const pending = layout.pending, info = Furniture.byId[pending.type], items = active.house.furniture;
        if (info.wall) {
            const wall = layout.wall || (pending.moving && items.find(v => v.id === pending.id)?.wall) || 'back';
            const placed = Furniture.wallPlacement(info, wall, (wall === 'back'||wall==='front') ? point.x : point.z, active.house);
            const item = { id: pending.id, type: pending.type, x: placed.x, z: placed.z, rot: Furniture.rotation(placed.rot), support: null, wall: placed.wall };
            let error = Furniture.validate(items, item, active.house);
            if (!pending.moving && Furniture.capacityError(active.house,pending.type)) error = Furniture.capacityError(active.house,pending.type);
            if (!pending.moving && Furniture.isScreenType(pending.type) && items.filter(v => Furniture.isScreenType(v.type)).length >= MAX_HOUSE_TVS) error = 'A house can have at most ' + MAX_HOUSE_TVS + ' stream TVs.';
            return { item, error };
        }
        let parent = null;
        if (info.stackable && layout.surface !== 'floor') {
            if (layout.surface !== 'auto') parent = items.find(v => v.id === layout.surface);
            else parent = items.filter(v => !v.support && v.id !== pending.id && Furniture.byId[v.type].surface)
                .sort((a, b) => Furniture.byId[b.type].h - Furniture.byId[a.type].h)
                .find(v => Furniture.overlap(Furniture.footprint(v), { ...point, w: .05, d: .05 }));
        }
        let x = point.x, z = point.z, rot = pending.rot;
        if (parent) {
            const r = Furniture.rotation(parent.rot), dx = x - parent.x, dz = z - parent.z;
            x = dx * Math.cos(r) - dz * Math.sin(r); z = dx * Math.sin(r) + dz * Math.cos(r); rot -= r;
        }
        const item = { id: pending.id, type: pending.type, x: Furniture.snap(x), z: Furniture.snap(z), rot: Furniture.rotation(rot), support: parent ? parent.id : null };
        if (item.type === 'room_wall') item.length = pending.length;
        if (Furniture.isRoomPiece(item.type)) Object.assign(item, Furniture.snapRoomPiece(items, { ...item, x, z }, active.house));
        if (Furniture.wallFriendly(item.type)) Object.assign(item, Furniture.snapToWall(items, { ...item, x, z }, active.house));
        let error = Furniture.validate(items, item, active.house);
        if (!pending.moving && Furniture.capacityError(active.house,pending.type)) error = Furniture.capacityError(active.house,pending.type);
        if (!pending.moving && pending.type === 'stream_tv' && items.filter(v => v.type === 'stream_tv').length >= MAX_HOUSE_TVS) error = 'A house can have at most ' + MAX_HOUSE_TVS + ' stream TVs.';
        if (!error && !item.support && !info.rug && info.h > .3 && Furniture.overlap(Furniture.footprint(item), { x: player.position.x - ORIGIN, z: player.position.z - ORIGIN, w: .7, d: .7 })) error = 'Leave room for your character. Move away before placing furniture here.';
        return { item, error };
    }
    function rotateFurniture() {
        if (!layout || !active || active.owner !== me()) return;
        const selected = layout.selected ? active.house.furniture.find(v => v.id === layout.selected) : null;
        if ((layout.pending && Furniture.byId[layout.pending.type].wall) || (selected && Furniture.byId[selected.type].wall)) {
            const current=layout.pending?(layout.wall||'back'):selected.wall;
            const wall=Furniture.WALLS[(Furniture.WALLS.indexOf(current)+1)%Furniture.WALLS.length];layout.wall=wall;
            if(layout.pending){paintFurnitureUI();return;}
            if(commitFurniture(Furniture.move(active.house,selected.id,{...selected,wall})))paintFurnitureUI();
            return;
        }
        if (layout.pending) { layout.pending.rot = Furniture.rotation(layout.pending.rot + Math.PI / 2); drawFloorPlan(); return; }
        const item = active.house.furniture.find(v => v.id === layout.selected);
        if (!item) return showToast('Select an object or an item to place.');
        const next = { ...item, rot: Furniture.rotation(item.rot + Math.PI / 2) };
        if (Furniture.isRoomPiece(item.type)) Object.assign(next, Furniture.snapRoomPiece(active.house.furniture, next, active.house));
        if (Furniture.wallFriendly(item.type)) Object.assign(next, Furniture.snapToWall(active.house.furniture, next, active.house));
        if (!item.support && !Furniture.byId[item.type].rug && Furniture.overlap(Furniture.footprint(next), { x: player.position.x - ORIGIN, z: player.position.z - ORIGIN, w: .7, d: .7 })) return showToast('Move away from this furniture before rotating it.');
        if (commitFurniture(Furniture.move(active.house, item.id, next))) paintFurnitureUI();
    }
    function addItemPreview(button, type, item) {
        const source=Furniture.thumbnail(type,active.house,item);if(!source)return;
        const image=document.createElement('img');image.className='house-item-preview';image.src=source;image.alt='';image.width=88;image.height=72;image.draggable=false;
        button.style.display='flex';button.style.alignItems='center';button.style.gap='10px';button.appendChild(image);
    }
    function paintFurnitureUI() {
        if (!layout || !active || active.owner !== me()) return;
        const previousScroll=modal.firstElementChild.scrollTop;
        modal.firstElementChild.style.width = 'min(96vw,1020px)';modal.firstElementChild.style.maxHeight='94vh'; modalBody.replaceChildren();
        const count = document.createElement('strong'), used=Furniture.usage(active.house), caps=Furniture.limits(active.house); count.textContent = '$' + Number(saveState.money || 0).toLocaleString() + ' · Furniture: '+used.furniture+'/'+caps.furniture+' · Walls/doors: '+used.rooms+'/'+caps.rooms+' · Stored: '+active.house.inventory.length+'/300'; modalBody.appendChild(count);
        const shell = document.createElement('div'); shell.className='house-shop-shell'; shell.style.cssText = 'display:grid;min-width:0;gap:18px;align-items:start;grid-template-columns:' + (innerWidth < 820 ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,320px)'); modalBody.appendChild(shell);
        const map = document.createElement('div'); shell.appendChild(map);
        const canvas = document.createElement('canvas'); canvas.width = 660; canvas.height = 540; canvas.setAttribute('aria-label', 'Furniture placement grid'); canvas.style.cssText = 'width:min(100%,52vh);height:auto;display:block;margin:auto;border:1px solid var(--p-line,#789);touch-action:none;cursor:crosshair'; map.appendChild(canvas); layout.canvas = canvas;
        const hint = document.createElement('p'); hint.style.cssText = 'font-size:13px;min-height:38px'; map.appendChild(hint); layout.hint = hint;
        const controls = document.createElement('div'); controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap'; map.appendChild(controls);
        if (layout.tab === 'rooms') controls.style.display='none';
        button('Rotate / next wall (R)', rotateFurniture, controls);
        button('Change color',editFurnitureItem,controls);
        button('Move selected', () => { if (layout.selected) startPlacement(layout.selected, true); else showToast('Select an object on the grid first.'); }, controls);
        button('Store selected', () => {
            if (!layout.selected) return showToast('Select an object on the grid first.');
            if (commitFurniture(Furniture.store(active.house, layout.selected))) { layout.selected = null; layout.pending = null; paintFurnitureUI(); }
        }, controls);
        const wallChoice = layout.pending || active.house.furniture.find(v => v.id === layout.selected);
        if (wallChoice?.type === 'room_wall') {
            const label = document.createElement('label'); label.textContent = 'Wall length: ';
            const length = document.createElement('select'); length.setAttribute('aria-label','Wall length');
            for (let value=.5; value<=6; value+=.25) { const option=document.createElement('option'); option.value=value;option.textContent=value+' units';length.appendChild(option); }
            length.value=Furniture.wallLength(wallChoice);
            length.onchange=()=>{ const value=Number(length.value);if(!layout.pending)startPlacement(wallChoice.id,true);layout.pending.length=value;paintFurnitureUI(); };
            label.appendChild(length);map.appendChild(label);
        }
        if (layout.pending) button('Cancel placement', () => { layout.pending = null; layout.hover = null; paintFurnitureUI(); }, controls);
        const surfaceLabel = document.createElement('label'); surfaceLabel.textContent = 'Place on: ';
        const select = document.createElement('select'); select.setAttribute('aria-label', 'Placement surface');
        for (const [value, label] of [['auto', 'Automatic surface'], ['floor', 'Floor'], ...active.house.furniture.filter(v => !v.support && Furniture.byId[v.type].surface).map((v,i) => [v.id, Furniture.byId[v.type].name + ' ' + (i+1)])]) {
            const option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option);
        }
        select.disabled=!layout.pending||!Furniture.byId[layout.pending.type].stackable;
        select.value = layout.surface; select.onchange = () => { layout.surface = select.value; drawFloorPlan(); }; surfaceLabel.appendChild(select); if(layout.tab==='rooms')surfaceLabel.style.display='none'; map.appendChild(surfaceLabel);
        if(layout.pending&&Furniture.byId[layout.pending.type].wall){const note=document.createElement('p');note.textContent='Wall: '+(layout.wall||'back')+' · Press R or Rotate to choose the next wall.';map.appendChild(note);}
        const selection = document.createElement('select'); selection.setAttribute('aria-label', 'Select placed furniture'); selection.style.cssText = 'width:100%;margin-top:8px';
        const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Select an object on the grid or here'; selection.appendChild(empty);
        active.house.furniture.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = Furniture.byId[item.type].name + (item.support ? ' (on furniture)' : item.wall ? ' (wall)' : ''); selection.appendChild(option); });
        if(layout.tab==='rooms')selection.style.display='none';
        selection.value = layout.selected || ''; selection.onchange = () => { layout.selected = selection.value || null; layout.pending = null; paintFurnitureUI(); }; map.appendChild(selection);
        const sidebar = document.createElement('div'); shell.appendChild(sidebar);
        const tabs = document.createElement('div'); tabs.className='house-mode-tabs'; sidebar.appendChild(tabs);
        button('Draw room', () => { layout.tab='rooms';layout.pending=null;layout.selected=null;paintFurnitureUI(); }, tabs);
        button('Shop', () => { layout.tab = 'shop'; paintFurnitureUI(); }, tabs); button('Storage', () => { layout.tab = 'storage'; paintFurnitureUI(); }, tabs);
        if(layout.tab==='shop') {
            if(!Furniture.catalogSections.some(section=>section.name===layout.category))layout.category=Furniture.catalogSections[0].name;
            const categories=document.createElement('div');categories.className='house-category-tabs';categories.setAttribute('role','tablist');categories.setAttribute('aria-label','Furniture categories');sidebar.appendChild(categories);
            for(const section of Furniture.catalogSections){
                const tab=button(section.name,()=>{layout.category=section.name;paintFurnitureUI();},categories);
                tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(section.name===layout.category));
                tab.setAttribute('aria-controls','house-shop-items');tab.id='house-category-'+Furniture.catalogSections.indexOf(section);
            }
        }
        const list = document.createElement('div'); list.className='house-item-list';
        if(layout.tab==='shop'){list.id='house-shop-items';list.setAttribute('role','tabpanel');list.setAttribute('aria-labelledby','house-category-'+Furniture.catalogSections.findIndex(section=>section.name===layout.category));}
        sidebar.appendChild(list);
        if (layout.tab === 'rooms') {
            const help=document.createElement('p');help.textContent='Drag a rectangle on the floor plan. Walls and a doorway are built together. Nothing is charged until you click Build room.';list.appendChild(help);
            const label=document.createElement('label');label.textContent='Doorway side: ';
            const side=document.createElement('select');side.setAttribute('aria-label','Room doorway side');
            for(const [value,name] of [['front','Bottom'],['back','Top'],['left','Left'],['right','Right']]){const option=document.createElement('option');option.value=value;option.textContent=name;side.appendChild(option);}
            side.value=layout.doorSide||'front';side.onchange=()=>{layout.doorSide=side.value;paintFurnitureUI();};label.appendChild(side);list.appendChild(label);
            const preview=roomPreview();
            const cost=document.createElement('p');cost.textContent=preview?.items ? preview.width+' × '+preview.depth+' · '+preview.items.length+' pieces · $'+preview.price.toLocaleString() : 'Draw a room at least 4 × 4 units.';list.appendChild(cost);
            const build=button('Build room'+(preview?.items?' · $'+preview.price.toLocaleString():''),()=>{
                if(!layout.draft)return;
                const id='room-'+Date.now().toString(36)+'-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
                const check=roomPreview(id);if(!check?.ok)return showToast(check?.error||'Draw a rectangle first.');
                if(commitFurniture(check)){layout.draft=null;paintFurnitureUI();showToast('Room built, saved and synced.');}
            },list);build.disabled=!preview?.ok;
            button('Clear drawing',()=>{layout.draft=null;paintFurnitureUI();},list);
            const roomIds=[...new Set(active.house.furniture.filter(v=>v.roomId).map(v=>v.roomId))];
            roomIds.forEach((id,index)=>button('Store whole room '+(index+1),()=>{if(commitFurniture(Furniture.storeRoom(active.house,id)))paintFurnitureUI();},list));
            const tip=document.createElement('p');tip.textContent='Stored walls and doorways are reused first, reducing the price. Furniture inside a room stays in place when you store its walls.';list.appendChild(tip);
        } else if (layout.tab === 'shop') {
            const placedTvs = active.house.furniture.filter(v => Furniture.isScreenType(v.type)).length;
            for (const info of Furniture.catalogSections.find(section=>section.name===layout.category).items) {
                const purchase = button('Buy ' + info.name + ' · $' + info.price.toLocaleString(), () => {
                    const id = 'f-' + Date.now().toString(36) + '-' + crypto.getRandomValues(new Uint32Array(2)).join('-');
                    if (commitFurniture(Furniture.buy(active.house, saveState.money, info.id, id))) { layout.tab = 'storage'; startPlacement(id, false); }
                }, list);
                addItemPreview(purchase,info.id);
                purchase.style.textAlign = 'left';
                if(info.collection&&!(active.house.collections||[]).includes(info.collection)){purchase.textContent='Collection reward: '+info.name+' (complete '+info.collection+')';purchase.disabled=true;}
                purchase.disabled = purchase.disabled || saveState.money < info.price || active.house.inventory.length >= Furniture.STORAGE_LIMIT || (Furniture.isScreenType(info.id) && placedTvs >= MAX_HOUSE_TVS);
            }
        }
        else {
            if (!active.house.inventory.length) { const p = document.createElement('p'); p.textContent = 'Purchased and stored furniture appears here.'; list.appendChild(p); }
            for (const item of active.house.inventory) {const place=button('Place ' + Furniture.byId[item.type].name, () => startPlacement(item.id, false), list);addItemPreview(place,item.type,item);}
        }
        const note = document.createElement('p'); note.style.fontSize = '12px'; note.textContent = 'Stacked objects count as furniture. Walls and doorways have a separate size-based allowance. Storing a table also stores its decorations. Purchases remain in Storage if placement is cancelled.'; sidebar.appendChild(note);
        function point(event) {
            const rect = canvas.getBoundingClientRect();
            return Furniture.planPoint(Furniture.floorPlan(active.house), (event.clientX-rect.left)/rect.width*canvas.width, (event.clientY-rect.top)/rect.height*canvas.height);
        }
        canvas.onpointermove = event => { if (layout) { layout.hover = point(event); if(layout.tab==='rooms'&&layout.dragging&&layout.draft)layout.draft.end=layout.hover; drawFloorPlan(); } };
        canvas.onpointerleave = () => { if (layout&&!layout.dragging) { layout.hover = null; drawFloorPlan(); } };
        canvas.onpointerup = event => { if(!layout||!layout.dragging)return;layout.draft.end=point(event);layout.dragging=false;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);paintFurnitureUI(); };
        canvas.onpointercancel = () => { if(layout){layout.dragging=false;layout.draft=null;paintFurnitureUI();} };
        canvas.onpointerdown = event => {
            event.preventDefault(); if (!layout) return;
            layout.hover = point(event);
            if(layout.tab==='rooms'){layout.draft={start:layout.hover,end:layout.hover};layout.dragging=true;canvas.setPointerCapture(event.pointerId);drawFloorPlan();return;}
            if (layout.pending) {
                const next = placementAt(layout.hover); if (next.error) return showToast(next.error);
                const pending = layout.pending, result = pending.moving ? Furniture.move(active.house, pending.id, next.item) : Furniture.place(active.house, pending.id, next.item);
                if (commitFurniture(result)) { layout.pending = null; layout.selected = pending.id; paintFurnitureUI(); }
            } else {
                const found = [...active.house.furniture].sort((a, b) => Number(!!a.support) - Number(!!b.support) || Number(!Furniture.byId[a.type].rug) - Number(!Furniture.byId[b.type].rug)).reverse().find(item => {
                    const pose = Furniture.resolve(active.house.furniture, item);
                    return Furniture.overlap(Furniture.footprint({ ...item, ...pose }), { ...layout.hover, w: .05, d: .05 });
                });
                layout.selected = found ? found.id : null; selection.value = layout.selected || ''; paintFurnitureUI();
            }
        };
        drawFloorPlan();
        modal.firstElementChild.scrollTop=previousScroll;
    }
    function roomPreview(id = 'room-preview') {
        if(!layout?.draft||!active)return null;
        const result=Furniture.buildRoom(active.house,saveState.money,layout.draft.start,layout.draft.end,layout.doorSide||'front',id);
        if(result.ok && result.items.some(item=>Furniture.collisionRects(item).some(rect=>Furniture.overlap(rect,{x:player.position.x-ORIGIN,z:player.position.z-ORIGIN,w:.7,d:.7})))) return {...result,ok:false,error:'Move your character away from the new walls.'};
        return result;
    }
    function drawFloorPlan() {
        if (!layout || !layout.canvas || !active) return;
        const canvas = layout.canvas, ctx = canvas.getContext('2d'), plan = Furniture.floorPlan(active.house), scale = plan.scale;
        const size = Furniture.roomSize(active.house);
        ctx.fillStyle = '#182126'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = active.house.floor; ctx.fillRect(plan.left,plan.top,plan.width,plan.height);
        ctx.lineWidth = 1;
        for (let x = -size.width/2; x <= size.width/2; x += .5) {
            ctx.strokeStyle = Number.isInteger(x) ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)';
            ctx.beginPath();ctx.moveTo(plan.cx+x*scale,plan.top);ctx.lineTo(plan.cx+x*scale,plan.top+plan.height);ctx.stroke();
        }
        for (let z = -size.depth/2; z <= size.depth/2; z += .5) {
            ctx.strokeStyle = Number.isInteger(z) ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)';
            ctx.beginPath();ctx.moveTo(plan.left,plan.cy+z*scale);ctx.lineTo(plan.left+plan.width,plan.cy+z*scale);ctx.stroke();
        }
        ctx.strokeStyle='#f4f0db';ctx.lineWidth=2;ctx.strokeRect(plan.left,plan.top,plan.width,plan.height);
        ctx.fillStyle='#f4f0db';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(size.width+' × '+size.depth+' · small squares = 0.5 units',plan.cx,16);
        ctx.fillStyle = 'rgba(35,60,51,.2)'; ctx.fillRect(330-1.25*scale,270+(size.depth/2-2.6)*scale,2.5*scale,2.1*scale); ctx.fillStyle = '#f4f0db'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KEEP DOORWAY CLEAR', 330, 270+(size.depth/2-.15)*scale);
        function draw(item, ghost, error) {
            const info = item.type === 'room_wall' ? { ...Furniture.byId[item.type], w: Furniture.wallLength(item) } : Furniture.byId[item.type], pose = Furniture.resolve(active.house.furniture, item);
            ctx.save(); ctx.translate(330 + pose.x * scale, 270 + pose.z * scale); ctx.rotate(-pose.rot);
            ctx.globalAlpha = ghost ? .7 : 1; ctx.fillStyle = ghost ? (error ? '#cc6262' : '#88cc94') : Furniture.isRoomPiece(item.type) ? active.house.wall : info.color;
            ctx.fillRect(-info.w * scale / 2, -info.d * scale / 2, info.w * scale, info.d * scale);
            if (item.type === 'room_doorway') { ctx.fillStyle=active.house.floor; ctx.fillRect(-.9*scale,-info.d*scale/2,1.8*scale,info.d*scale); }
            ctx.strokeStyle = ghost ? (error ? '#f74646' : '#baffbe') : item.id === layout.selected ? '#ffe294' : '#3d4242'; ctx.lineWidth = ghost || item.id === layout.selected ? 3 : 1.5;
            ctx.strokeRect(-info.w * scale / 2, -info.d * scale / 2, info.w * scale, info.d * scale);
            if(!info.rug){ctx.fillStyle='#344044';ctx.beginPath();ctx.moveTo(0,info.d*scale*.4);ctx.lineTo(-4,info.d*scale*.4-7);ctx.lineTo(4,info.d*scale*.4-7);ctx.closePath();ctx.fill();}ctx.restore();
            ctx.fillStyle = '#1b2728'; ctx.font = info.stackable ? '10px sans-serif' : '12px sans-serif'; ctx.fillText(info.name.replace('Wooden ', '').replace('Cozy ', ''), 330 + pose.x * scale, 274 + pose.z * scale, info.w * scale - 2);
        }
        [...active.house.furniture].sort((a, b) => Number(!!a.support) - Number(!!b.support) || Number(!Furniture.byId[a.type].rug) - Number(!Furniture.byId[b.type].rug)).forEach(item => draw(item, false));
        if(layout.tab==='rooms') {
            const preview=roomPreview();
            if(preview?.items) preview.items.forEach(item=>draw(item,true,!preview.ok));
            if(layout.draft){const a=layout.draft.start,b=layout.draft.end;ctx.strokeStyle=preview?.ok?'#88eeaa':'#eeaa77';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.strokeRect(plan.cx+Math.min(a.x,b.x)*scale,plan.cy+Math.min(a.z,b.z)*scale,Math.abs(a.x-b.x)*scale,Math.abs(a.z-b.z)*scale);ctx.setLineDash([]);}
            layout.hint.textContent=preview ? preview.ok ? preview.width+' × '+preview.depth+' room · $'+preview.price.toLocaleString()+'. Click Build room to confirm.' : preview.error : 'Drag from one corner to the opposite corner to draw a room. Choose a doorway side, then click Build room.';
            return;
        }
        const placement = placementAt(layout.hover);
        if (placement) draw(placement.item, true, placement.error);
        const wallName = w => w === 'left' ? 'left wall' : w === 'right' ? 'right wall' : 'back wall';
        const pendingInfo = layout.pending ? Furniture.byId[layout.pending.type] : null;
        layout.hint.textContent = placement
            ? (placement.error || ('Click to place ' + Furniture.byId[placement.item.type].name + (placement.item.wall ? ' on the ' + wallName(placement.item.wall) : placement.item.support ? ' on ' + Furniture.byId[active.house.furniture.find(v => v.id === placement.item.support).type].name : ' on the floor') + (placement.item.wall ? '.' : '. R rotates.')))
            : layout.pending
                ? (pendingInfo.wall ? 'Press R to choose a wall, then click along it to hang the ' + pendingInfo.name + '. Press R to cycle walls; the item faces into the room.' : 'Move over the grid and click to place ' + pendingInfo.name + '. R rotates. Green is valid; red is blocked.')
                : 'Click furniture to select it. Use Move, Rotate or Store. Walls snap to edges and each other; adjust Wall length to fit a gap. Small squares are 0.5 units.';
    }
    function makeRoom(house) {
        const { width, depth } = Furniture.roomSize(house);
        const room = new THREE.Scene(); room.background = new THREE.Color('#20252d'); room.fog = new THREE.Fog('#20252d', 45, 100);
        const wall = new THREE.MeshBasicMaterial({ color: house.wall, side: THREE.FrontSide });
        const floor = new THREE.MeshBasicMaterial({ color: house.floor, side: THREE.DoubleSide });
        const trim = new THREE.MeshBasicMaterial({ color: house.trim });
        const root = new THREE.Group(); root.position.set(ORIGIN, 0, ORIGIN); room.add(root);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floor); ground.rotation.x = -Math.PI / 2; root.add(ground);
        // One-sided interior walls provide a cutaway view from an orbit camera.
        for (const [x, z, panelWidth, rotation] of [[0, -depth/2, width, 0], [-width/2, 0, depth, Math.PI / 2], [width/2, 0, depth, -Math.PI / 2], [0, depth/2, width, Math.PI]]) {
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelWidth, Furniture.INTERIOR_HEIGHT), wall); panel.position.set(x, Furniture.INTERIOR_HEIGHT / 2, z); panel.rotation.y = rotation; root.add(panel);
        }
        function box(w, h, d, x, y, z, material = trim) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); root.add(mesh); }
        box(width, .15, .1, 0, .075, -depth/2+.05); box(.1, .15, depth-.1, -width/2+.05, .075, .05); box(.1, .15, depth-.1, width/2-.05, .075, .05);
        const door = new THREE.MeshBasicMaterial({ color: '#795337', side: THREE.FrontSide });
        // A plane (not a box) keeps the doorway open from the orbit camera's
        // outside view while still showing a door from inside the room.
        const doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.9), door);
        doorMesh.position.set(0, 1.45, depth/2-.06); doorMesh.rotation.y = Math.PI; root.add(doorMesh);
        box(.13, 2.985, .15, -1, 1.4925, depth/2-.16); box(.13, 2.985, .15, 1, 1.4925, depth/2-.16); box(2.1, .13, .15, 0, 3.05, depth/2-.16);
        box(.12, .12, .1, -.55, 1.4, depth/2-.17, new THREE.MeshBasicMaterial({ color: '#e5c476' }));
        room.userData.houseMaterials = { wall, floor, trim };
        return room;
    }
    function rebuildRoom() {
        if (!active) return;
        clearHouseScreens();
        const old = active.room, room = makeRoom(active.house);
        for (const obj of [player, ...Object.values(otherPlayers).map(p => p.mesh)]) if (obj && obj.parent === old) room.add(obj);
        active.room = room;
        disposeRoom(old); renderFurniture(); updateStatus();
        if (window.refreshScreenQueue) window.refreshScreenQueue();
    }
    function updateStatus() {
        ensureUI(); status.replaceChildren(); status.style.display = active ? 'flex' : 'none'; if (!active) return;
        const name = document.createElement('span'); name.textContent = active.house.name + (active.owner === me() ? ' · Your house' : ' · Visiting'); status.appendChild(name);
        if (active.owner === me()) button('Customize', editHouse, status);
        button('Leave house', leave, status);
    }
    function applyColors() {
        if (!active) return;
        const materials = active.room.userData.houseMaterials;
        const colorKey=JSON.stringify([active.house.wall,active.house.trim]);
        const recolor=active.room.userData.colorKey!==colorKey;active.room.userData.colorKey=colorKey;
        for (const key of ['wall', 'floor', 'trim']) materials[key].color.set(active.house[key]);
        const group = active.room.getObjectByName('houseFurnitureGroup');
        if (group && recolor) for (const mesh of group.children) {
            const item = active.house.furniture.find(v => v.id === mesh.userData.furnitureId);
            if (!item || !Furniture.isRoomPiece(item.type)) continue;
            const replacement = Furniture.makeMesh(item.type, active.house, item);
            mesh.geometry.dispose(); mesh.geometry = replacement.geometry; replacement.material.dispose();
        }
        updateStatus();
    }
    function enter(owner, house, token) {
        if (!player || active || !nearby) return;
        if (fishingState !== 'idle') stopFishing(false, 'Entered a house.');
        if (isSailing && typeof toggleSailing === 'function') toggleSailing();
        const data = normalize(house), room = makeRoom(data);
        active = { owner, token, house: data, room, world: scene, position: player.position.clone(), rotation: player.rotation.y, cameraRotation: cameraRotationY, cameraDistance, returnDoor: nearby };
        scene.remove(player); room.add(player);
        player.position.set(ORIGIN, 0, ORIGIN + Furniture.roomSize(data).depth/2-2.3); player.rotation.y = Math.PI;
        playerVelocity.set(0, 0, 0); knockbackVelocity.set(0, 0, 0); isProne = false; isDiving = false; isSitting = false;
        cameraRotationY = 0; cameraDistance = Math.min(cameraDistance, 9);
        if (window.RainAudio) RainAudio.toggle(false);
        renderFurniture(); updateStatus();
        if (owner === me()) send({ type: 'house:update', house: { ...data, inventory: [] } });
        sendUpdate();
    }
    function disposeRoom(room) {
        const materials = new Set(), textures = new Set();
        room.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => { materials.add(m); if (m.map) textures.add(m.map); }); });
        textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
    }
    function leave() {
        if (!active) return;
        clearHouseScreens();
        if (window.closeScreenQueue) window.closeScreenQueue();
        const previous = active; active = null;
        previous.room.remove(player); scene.add(player);
        for (const id in otherPlayers) if (otherPlayers[id].mesh.parent === previous.room) { previous.room.remove(otherPlayers[id].mesh); scene.add(otherPlayers[id].mesh); }
        player.position.copy(previous.position); player.rotation.y = previous.rotation;
        cameraRotationY = previous.cameraRotation; cameraDistance = previous.cameraDistance;
        playerVelocity.set(0, 0, 0); knockbackVelocity.set(0, 0, 0); closeModal(); updateStatus(); disposeRoom(previous.room);
        updateWeatherVisuals(); send({ type: 'house:leave' }); sendUpdate();
    }
    const doorPoint = new THREE.Vector3(), collisionPoint = new THREE.Vector3();
    function refresh() {
        if (Date.now() < nextTick) return; nextTick = Date.now() + 100;
        if (typeof isHost !== 'undefined' && isHost) hostRouter().prune();
        if (visiting && Date.now() >= pendingUntil) { visiting = null; pendingUntil = 0; if (modal && modal.dataset.page === 'waiting') closeModal(); showToast('The house visit request expired.'); }
        for (const [id, request] of requests) if (Date.now() >= request.expiresAt) { requests.delete(id); if (modal && modal.dataset.page === 'request') closeModal(); }
        showRequest();
        if (!player) return;
        for (const id in otherPlayers) {
            const peer = otherPlayers[id], matches = !!active && peer.lastData.houseOwner === active.owner;
            const destination = matches ? active.room : active ? active.world : scene;
            if (peer.mesh.parent !== destination) { peer.mesh.parent && peer.mesh.parent.remove(peer.mesh); destination.add(peer.mesh); }
            peer.mesh.visible = active ? matches : !peer.lastData.houseOwner;
        }
        nearby = null;
        const prompt = document.getElementById('npc-prompt'), action = document.getElementById('btn-action');
        if (active) {
            interactTarget = null; canSell = false;
            if (prompt) prompt.style.display = 'none';
            if (Math.hypot(player.position.x - ORIGIN, player.position.z - ORIGIN - (Furniture.roomSize(active.house).depth/2-.7)) < 2) {
                interactTarget = 'house-exit'; if (prompt) { prompt.textContent = 'PRESS ' + String(saveState.keybinds.interact || 'KeyE').replace('Key', '') + ' TO LEAVE HOUSE'; prompt.style.display = 'block'; }
                if (action) action.textContent = 'LEAVE';
                return;
            }
            if(displayPrompt(prompt,action))return;
            const tv = nearestTv();
            if (tv) {
                interactTarget = 'house-tv';
                if (prompt) { prompt.textContent = 'PRESS ' + String(saveState.keybinds.interact || 'KeyE').replace('Key', '') + ' FOR QUEUE'; prompt.style.display = 'block'; }
                if (action) action.textContent = 'QUEUE';
            }
            return;
        }
        if (isInVoid || isInLavaWorld) return;
        let best = 2.7;
        for (const mesh of entrances) {
            let root = mesh; while (root.parent) root = root.parent;
            if (root !== scene) { entrances.delete(mesh); continue; }
            mesh.updateWorldMatrix(true, false); doorPoint.set(0, 0, 3.5).applyMatrix4(mesh.matrixWorld);
            const distance = Math.hypot(player.position.x - doorPoint.x, player.position.z - doorPoint.z);
            if (distance < best) { best = distance; nearby = mesh; }
        }
        if (nearby) {
            canSell = false; interactTarget = 'house';
            if (prompt) { prompt.textContent = 'PRESS ' + String(saveState.keybinds.interact || 'KeyE').replace('Key', '') + ' TO ENTER HOUSE'; prompt.style.display = 'block'; }
            if (action) action.textContent = 'ENTER';
        }
    }
    function applyInteraction(){
        if(!player)return;
        const prompt=document.getElementById('npc-prompt'),action=document.getElementById('btn-action');
        if(active){
            canSell=false;interactTarget=null;if(prompt)prompt.style.display='none';
            if(Math.hypot(player.position.x-ORIGIN,player.position.z-ORIGIN-(Furniture.roomSize(active.house).depth/2-.7))<2){
                interactTarget='house-exit';if(prompt){prompt.textContent='PRESS '+String(saveState.keybinds.interact||'KeyE').replace('Key','')+' TO LEAVE HOUSE';prompt.style.display='block';}if(action)action.textContent='LEAVE';
            } else {
                if(displayPrompt(prompt,action))return;
                const tv=nearestTv();
                if(tv){interactTarget='house-tv';if(prompt){prompt.textContent='PRESS '+String(saveState.keybinds.interact||'KeyE').replace('Key','')+' FOR QUEUE';prompt.style.display='block';}if(action)action.textContent='QUEUE';}
            }
        }else if(nearby&&!isInVoid&&!isInLavaWorld){
            canSell=false;interactTarget='house';if(prompt){prompt.textContent='PRESS '+String(saveState.keybinds.interact||'KeyE').replace('Key','')+' TO ENTER HOUSE';prompt.style.display='block';}if(action)action.textContent='ENTER';
        }
    }
    function tick(){refresh();applyInteraction();}
    window.Housing = {
        get renderScene(){return active?active.room:null;},
        isInteriorPoint(x,z){return Math.abs(x-ORIGIN)<20&&Math.abs(z-ORIGIN)<20;},
        get inside() { return !!active; }, get owner() { return active ? active.owner : ''; },
        get modalOpen() { return !!modal && modal.style.display === 'flex'; },
        registerExterior(mesh) { entrances.add(mesh); },
        collidesExterior(position){
            if(active)return false;
            for(const mesh of entrances){let root=mesh;while(root.parent)root=root.parent;if(root!==scene)continue;
                mesh.updateWorldMatrix(true,false);collisionPoint.copy(position);mesh.worldToLocal(collisionPoint);
                if(Math.abs(collisionPoint.x)<3.65&&Math.abs(collisionPoint.z)<3.15)return true;
            }
            return false;
        },
        interact() { if (active) { if (interactTarget === 'house-tv') openHouseTv(); else if(interactTarget==='house-display')openCatchDisplay(); else leave(); } else openEntrance(); },
        addHouseTvQueue,
        tick, leave, normalize, restoreSave, savePreset, restorePreset, houseSave,
        canStand(pos) {
            const size = Furniture.roomSize(active?.house);
            if(Math.abs(pos.x-ORIGIN)>=size.width/2-.55||Math.abs(pos.z-ORIGIN)>=size.depth/2-.55)return false;
            if(!active) return true;
            return !(active.blockers||[]).some(rect=>{
                const top=rect.top===undefined?Infinity:rect.top;
                return (pos.y||0)<top-.12&&Math.abs(pos.x-ORIGIN-rect.x)<rect.w/2+.27&&Math.abs(pos.z-ORIGIN-rect.z)<rect.d/2+.27;
            });
        },
        standableTopAt(x,z,feetY) {
            if(!active) return -Infinity;
            const lx=x-ORIGIN, lz=z-ORIGIN;
            let top=-Infinity;
            for(const part of active.blockers||[]){
                if(!part.landable||!Number.isFinite(part.top))continue;
                if(Math.abs(lx-part.x)>part.w/2+.08||Math.abs(lz-part.z)>part.d/2+.08)continue;
                if(feetY>=part.top-.15&&part.top>top)top=part.top;
            }
            return top;
        },
        clampPlayer() { if (active && player) { const size=Furniture.roomSize(active.house), hx=size.width/2-.55, hz=size.depth/2-.55; player.position.x = bounded(player.position.x, ORIGIN - hx, ORIGIN + hx); player.position.z = bounded(player.position.z, ORIGIN - hz, ORIGIN + hz); } },
        presence() { return { houseOwner: active ? active.owner : '', houseToken: active ? active.token : '' }; },
        handleClient(from, message) { hostRouter().receive(from, message); },
        handleHost: receive,
        validatePresence(from, payload) { return hostRouter().allowed(from, payload); },
        onPlayerLeft(id) { if (isHost) hostRouter().disconnect(id); if (active && active.owner === id) { leave(); showToast('The house owner left the lobby.'); } if (visiting && visiting.owner === id) { visiting = null; closeModal(); } },
        cancelForWorldChange() { if (active) leave(); visiting = null; requests.clear(); closeModal(); }
    };
})();
