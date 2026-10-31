const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../housing.js'), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname,'../furniture.js'),'utf8'),context);
context.Furniture=context.window.Furniture;
vm.runInContext(source.slice(0, source.indexOf('    const entrances')) + '\n})();', context);
const { HouseRouter, normalize, housePosition, ORIGIN } = context.window.HouseProtocol;
let now = 10000, serial = 0;
const players = new Set(['host', 'owner', 'guest', 'stranger']);
const inbox = [];
const router = new HouseRouter({ now: () => now, online: id => players.has(id), name: id => id,
    token: () => 'token-' + (++serial), deliver: (id, data) => inbox.push({ id, data }) });
const packet = (owner, token = '') => ({ pos: { x: ORIGIN, y: 0, z: ORIGIN }, houseOwner: owner, houseToken: token });
const last = (id,type) => {
    let house=null,result=null;
    for(const entry of inbox.filter(v=>v.id===id)){
        if(entry.data.type==='house:grant')house=entry.data.house;
        if(entry.data.type==='house:update'){house=entry.data.patch?context.window.HouseProtocol.applyHousePatch(house,entry.data.patch):entry.data.house;}
        if(entry.data.type===type)result=entry.data.type==='house:update'?{...entry.data,house}:entry.data;
    }
    return result;
};
assert(!router.allowed('guest', packet('owner')), 'cannot enter a stranger’s house by spoofing coordinates');
assert(router.allowed('owner', packet('owner')), 'players may enter their own house');
router.receive('guest', { type: 'house:request', owner: 'owner', from: 'stranger' });
const request = last('owner', 'house:request');
assert(request && request.requester === 'guest', 'connection identity overrides forged sender fields');
assert.equal(last('guest', 'house:pending').requestId, request.requestId);
router.receive('stranger', { type: 'house:decision', requestId: request.requestId, accept: true });
assert(!last('guest', 'house:grant'), 'only the owner can accept a visit');
router.receive('owner', { type: 'house:decision', requestId: request.requestId, accept: false });
assert(last('guest', 'house:denied'));
assert(!router.allowed('guest', packet('owner')));
now += 3100;
router.receive('guest', { type: 'house:request', owner: 'owner' });
const next = last('owner', 'house:request');
router.receive('owner', { type: 'house:decision', requestId: next.requestId, accept: true,
    house: { name: 'Owner’s room', wall: '#123456', floor: '#abcdef', trim: '#aabbcc', furniture: [{ id: '1', type: 'chair', x: 2, z: 3, rot: 1 }] } });
const grant = last('guest', 'house:grant');
assert(grant && grant.owner === 'owner' && grant.house.name === 'Owner’s room');
assert(router.allowed('guest', packet('owner', grant.token)));
assert(!router.allowed('stranger', packet('owner', grant.token)), 'a guest token is tied to its connection');
assert(!router.allowed('guest', packet('owner', 'wrong-token')));
assert(!router.allowed('guest', { ...packet('owner', grant.token), pos: { x: 0, y: 0, z: 0 } }));
router.receive('owner', { type: 'house:update', house: { name: 'Renamed', wall: '#ffffff' } });
assert.equal(last('guest', 'house:update').house.name, 'Renamed');
now+=250;router.prune();router.receive('owner',{type:'house:update',house:{name:'Furnished room',furniture:[{id:'lamp',type:'lamp',x:.5,z:0,rot:0,support:'table'},{id:'table',type:'table',x:-2,z:-2,rot:Math.PI/2,support:null}]}});
const furnished=last('guest','house:update').house;
assert.equal(furnished.furniture.length,2);assert.equal(furnished.furniture.find(v=>v.id==='lamp').support,'table','guest snapshots preserve stacked decorations');
now+=250;router.prune();router.receive('owner',{type:'house:update',house:{name:'TV room',furniture:[{id:'tv',type:'stream_tv',x:0,z:-2,rot:0,support:null,stream:{provider:'youtube',videoId:'dQw4w9WgXcQ',startedAt:123,queue:[{provider:'youtube',id:'M7lc1UVf-VE',title:'Demo',addedBy:'Host'}]}}]}});
const tvSnapshot=last('guest','house:update').house;
assert.equal(tvSnapshot.furniture[0].stream.videoId,'dQw4w9WgXcQ','guest snapshots preserve the house TV stream');
assert.equal(tvSnapshot.furniture[0].stream.queue[0].title,'Demo','guest snapshots preserve the house TV queue');
now+=250;router.prune();router.receive('owner',{type:'house:update',house:{name:'Wall room',furniture:[{id:'wall-tv',type:'wall_tv',x:2,z:0,rot:0,support:null,wall:'back',stream:{provider:'youtube',videoId:'M7lc1UVf-VE',startedAt:321}}]}});
const wallSnapshot=last('guest','house:update').house;
assert.equal(wallSnapshot.furniture[0].wall,'back','guest snapshots preserve wall-mounted furniture');
assert.equal(wallSnapshot.furniture[0].z,-4.9,'wall-mounted TV stays at the wall plane');
assert.equal(wallSnapshot.furniture[0].stream.videoId,'M7lc1UVf-VE','guest snapshots preserve the wall TV stream');
router.receive('stranger', { type: 'house:kick', guest: 'guest' });
assert(router.allowed('guest', packet('owner', grant.token)), 'strangers cannot eject guests');
router.receive('owner', { type: 'house:kick', guest: 'guest' });
assert(last('guest', 'house:ejected'));
assert(!router.allowed('guest', packet('owner', grant.token)));
now += 3100;
router.receive('guest', { type: 'house:request', owner: 'owner' });
now += 45001; router.prune();
assert.equal(router.pending.size, 0);
assert(last('owner', 'house:cancelRequest'));
now += 3100;
router.receive('guest', { type: 'house:request', owner: 'owner' });
router.receive('guest', { type: 'house:cancel' });
assert.equal(router.pending.size, 0);
now += 3100;
router.receive('guest', { type: 'house:request', owner: 'owner' });
router.receive('owner', { type: 'house:decision', requestId: last('owner', 'house:request').requestId, accept: true, house: {} });
const secondGrant = last('guest', 'house:grant');
players.delete('owner'); router.disconnect('owner');
assert(!router.allowed('guest', packet('owner', secondGrant.token)));
assert.equal(router.access.size, 0);
// Host-owned houses use the exact same request/approval protocol.
now += 3100;
router.receive('guest', { type: 'house:request', owner: 'host' });
router.receive('host', { type: 'house:decision', requestId: last('host', 'house:request').requestId, accept: true, house: {} });
assert(router.allowed('guest', packet('host', last('guest', 'house:grant').token)));
router.receive('guest', { type: 'house:leave' });
assert.equal(router.access.size, 0);
const house = normalize({ name: 'a'.repeat(100), wall: 'url(bad)', floor: '#123456', furniture: [{ type: '../bad', x: 1 }, { type: 'chair', x: 100, z: -100, rot: Infinity }] });
assert.equal(house.name.length, 40); assert.equal(house.wall, '#eadac4'); assert.equal(house.floor, '#123456');
assert.equal(house.furniture.length, 1); assert.equal(house.furniture[0].x, 5); assert.equal(house.furniture[0].z, -4);
assert.equal(JSON.stringify(normalize(JSON.parse(JSON.stringify(house)))), JSON.stringify(house), 'house data survives a save/restart round trip');
assert(!housePosition({ x: Infinity, y: 0, z: ORIGIN }));
assert(!housePosition({ x: ORIGIN + 20, y: 0, z: ORIGIN }));
const ui = fs.readFileSync(path.join(__dirname, '../ui.js'), 'utf8');
assert(ui.includes('Housing.restoreSave(d.house)'), 'game save loader restores the house');
assert(ui.includes('Housing.validatePresence(clientId,data.payload)'), 'host validates house movement');
assert(ui.includes('Housing.renderScene || scene'), 'room rendering never replaces the outdoor scene');
const worldgen = fs.readFileSync(path.join(__dirname, '../worldgen.js'), 'utf8');
assert(worldgen.includes('Player House (enterable)') && worldgen.includes('Housing.registerExterior(m)'), 'editor buildings become functional house entrances');
assert(ui.includes("house.name='playerHouseExterior'"), 'default cabin is replaced by the entrance');
console.log('PASS: own/guest/host houses, owner-only approval, spoofing protection, decline/cancel/expiry, ejection/disconnect, saved customization and game/editor hooks.');
// Playback belongs to the running page session, not a restored save.
const playbackHouse = normalize({sizeTier:2, name:'Movie room', furniture:[
    {id:'screen',type:'stream_tv',x:0,z:0,rot:0,stream:{provider:'youtube',videoId:'M7lc1UVf-VE',startedAt:123,queue:[{provider:'youtube',id:'dQw4w9WgXcQ'}]}},
    {id:'wall-screen',type:'wall_tv',wall:'back',x:0,z:-9,stream:{provider:'twitch',twitchId:'shroud',startedAt:123}},
    {id:'seat',type:'chair',x:3,z:0,rot:0}
], inventory:[{id:'stored-screen',type:'stream_tv',stream:{provider:'youtube',videoId:'dQw4w9WgXcQ',startedAt:123}}]});
const savedPlayback=JSON.stringify(playbackHouse);
const restored=context.window.HouseProtocol.restoreSave(JSON.parse(savedPlayback));
assert.equal(restored.sizeTier,2);assert.equal(restored.name,'Movie room');assert.equal(restored.furniture.length,3);assert.equal(restored.inventory.length,1);
for(const item of [...restored.furniture,...restored.inventory])assert.equal(item.stream,undefined,'new session must not restart a saved video or queue');
assert.equal(JSON.stringify(playbackHouse),savedPlayback,'restore must not mutate its input');
const livePlayback=normalize(JSON.parse(savedPlayback));
assert.equal(livePlayback.furniture.find(v=>v.id==='screen').stream.videoId,'M7lc1UVf-VE','live snapshots still retain playback');
assert.equal(livePlayback.furniture.find(v=>v.id==='screen').stream.queue.length,1,'live queues remain synced');
assert.equal(livePlayback.inventory[0].stream.videoId,'dQw4w9WgXcQ','same-session storage retains playback');
console.log('PASS: new-session TV playback and queues cleared; live playback, owned TVs, layout and upgrades preserved.');
