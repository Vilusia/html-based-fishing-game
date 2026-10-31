const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const THREE = require('../vendor/three.min.js');
const context = vm.createContext({ THREE, window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../furniture.js'), 'utf8'), context);
const F = context.window.Furniture;
const empty = () => ({ name: 'Test house', wall: '#eeeeee', floor: '#997755', trim: '#554433', furniture: [], inventory: [] });
let house = empty(), money = 5000;
let result = F.buy(house, money, 'table', 'table-1');
assert(result.ok); assert.equal(result.money, 4250); assert.equal(house.inventory.length, 0, 'transaction must not mutate its input');
house = result.house; money = result.money;
assert(!F.buy(house, 1, 'table', 'too-poor').ok); assert.equal(house.inventory.length, 1);
assert(!F.buy(house, money, 'table', 'table-1').ok, 'duplicate copies must not be minted');
result = F.place(house, 'table-1', { x: .12, z: .1, rot: 0 }); assert(result.ok); house = result.house;
assert.equal(house.furniture[0].x, 0); assert.equal(house.furniture[0].z, 0); assert.equal(house.inventory.length, 0);
assert(!F.place(house, 'not-owned', { x: 3, z: 0 }).ok);
result = F.buy(house, money, 'lamp', 'lamp-1'); assert(result.ok); house = result.house; money = result.money;
assert.equal(money, 3900);
assert(!F.place(house, 'lamp-1', { x: 0, z: 0, rot: 0 }).ok, 'lamp cannot overlap the table on the floor');
result = F.place(house, 'lamp-1', { x: .5, z: 0, rot: 0, support: 'table-1' }); assert(result.ok); house = result.house;
let lamp = house.furniture.find(v => v.id === 'lamp-1'), pose = F.resolve(house.furniture, lamp);
assert.equal(pose.y, 1.2); assert.equal(pose.x, .5); assert.equal(pose.z, 0);
result = F.move(house, 'table-1', { x: -3, z: -2, rot: Math.PI / 2 }); assert(result.ok); house = result.house;
lamp = house.furniture.find(v => v.id === 'lamp-1'); pose = F.resolve(house.furniture, lamp);
assert(Math.abs(pose.x + 3) < .001 && Math.abs(pose.z + 2.5) < .001, 'table rotation carries its supported lamp');
assert.equal(pose.rot, Math.PI / 2);
result = F.store(house, 'table-1'); assert(result.ok); house = result.house;
assert.equal(house.furniture.length, 0); assert.equal(house.inventory.length, 2, 'storing a support preserves its decorations');
// Rotation changes floor occupancy and cannot push furniture through a wall.
result = F.place(house, 'table-1', { x: 4.5, z: -3.5, rot: 0 }); assert(result.ok); house = result.house;
assert(!F.move(house, 'table-1', { x: 5, z: -4, rot: Math.PI / 2 }).ok);
assert(!F.move(house, 'table-1', { x: 0, z: 3, rot: 0 }).ok, 'doorway/arrival area must stay clear');
assert(!F.place(house, 'lamp-1', { x: 1, z: 0, support: 'table-1' }).ok, 'decorations must fit wholly on the tabletop');
assert(!F.place(house, 'lamp-1', { x: 0, z: 0, support: 'lamp-1' }).ok, 'cannot support yourself');
const nesting = empty(); nesting.furniture = [{ id: 't', type: 'table', x: 0, z: 0, rot: 0, support: null }, { id: 'l', type: 'lamp', x: 0, z: 0, rot: 0, support: 't' }]; nesting.inventory = [{ id: 'l2', type: 'lamp' }];
assert(!F.place(nesting, 'l2', { x: 0, z: 0, support: 'l' }).ok, 'a lamp is not a supporting surface');
assert(!F.place(nesting, 'l2', { x: 0, z: 0, support: 't' }).ok, 'surface decorations cannot overlap');
// Rug can sit under furniture, but solids still block walking.
const rugs = empty(); rugs.inventory = [{ id: 'r', type: 'rug' }, { id: 'c', type: 'chair' }];
let rugRoom = F.place(rugs, 'r', { x: -2, z: -2 }).house;
assert(!F.collision(rugRoom.furniture, -2, -2)); rugRoom = F.place(rugRoom, 'c', { x: -2, z: -2 }).house;
assert(F.collision(rugRoom.furniture, -2, -2));
// The exact object cap includes both root and stacked objects.
const full = empty();
full.furniture = Array.from({ length: 75 }, (_, i) => ({ id: 'p' + i, type: 'books', x: -5 + (i % 20) * .5, z: -4 + Math.floor(i / 20) * .5, rot: 0, support: null }));
full.inventory = [{ id: 'extra', type: 'vase' }];
assert(!F.place(full, 'extra', { x: 0, z: -1 }).ok); assert(F.buy(full, 100000, 'vase', 'new').ok);
assert(F.normalizeLayout([...full.furniture, { id: 'overflow', type: 'books', x: 3, z: 0, rot: 0 }]).length <= 75);
const oneSpace = empty(); oneSpace.furniture = full.furniture.slice(0, 73);
oneSpace.inventory = [{ id: 'table-final', type: 'table' }, { id: 'lamp-final', type: 'lamp' }, { id: 'lamp-extra', type: 'lamp' }];
let lastSpace = F.place(oneSpace, 'table-final', { x: 2, z: 0 }); assert(lastSpace.ok);
lastSpace = F.place(lastSpace.house, 'lamp-final', { x: 0, z: 0, support: 'table-final' }); assert(lastSpace.ok); assert.equal(lastSpace.house.furniture.length, 75);
assert(!F.place(lastSpace.house, 'lamp-extra', { x: .5, z: 0, support: 'table-final' }).ok);
const reordered = F.normalizeLayout([...nesting.furniture].reverse());
assert.equal(reordered.length, 2, 'children may arrive before their support in a network snapshot');
assert.equal(F.normalizeLayout([{ id: 'a', type: 'constructor' }, { id: 'b', type: '__proto__' }]).length, 0);
assert.equal(F.normalizeInventory([{ id: 'x', type: { toString: 'bad' } }], []).length, 0);
const restored = F.normalizeLayout(JSON.parse(JSON.stringify(reordered)));
assert.equal(JSON.stringify(restored), JSON.stringify(reordered), 'grid, rotation and support survive restart');
assert.equal(F.normalizeInventory([{ id: 't', type: 'table' }, { id: 'x', type: 'books' }, { id: 'x', type: 'books' }], restored).length, 1);
// Every catalog item is a single low-poly unlit draw, not a group of draw calls.
for (const info of F.catalog) {
    const mesh = F.makeMesh(info.id); assert(mesh.isMesh && mesh.material.isMeshBasicMaterial && mesh.material.vertexColors);
    assert.equal(mesh.children.length, info.id==='aquarium'?1:0); if(info.id==='aquarium'){assert(mesh.getObjectByName('aquariumGlass').material.transparent);assert.equal(mesh.getObjectByName('aquariumGlass').material.depthWrite,false);} assert(mesh.geometry.attributes.position.count > 0);
    assert([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    assert(mesh.geometry.attributes.position.count / 3 <= 300, info.id + ' exceeds its triangle budget');
    mesh.geometry.dispose(); mesh.material.dispose();
}
// The expanded catalog stays internally consistent: unique ids, real prices,
// support surfaces that fit inside their own footprint, and stream data that
// survives a save/restart round trip.
assert.equal(F.catalog.length, 154, 'expected 154 catalog pieces');
assert.equal(new Set(F.catalog.map(v => v.id)).size, F.catalog.length, 'catalog ids must be unique');
assert.equal(new Set(F.catalog.map(v => v.name)).size, F.catalog.length, 'catalog names must be unique');
for (const info of F.catalog) {
    assert(info.price > 0, info.id + ' must have a price');
    if (info.surface) {
        assert(info.surface.w <= info.w + 1e-9 && info.surface.d <= info.d + 1e-9 && info.surface.y <= info.h + 1e-9, info.id + ' has an out-of-bounds surface');
    }
}
assert.equal(F.standHeight(F.byId.chair), .74);
assert.equal(F.standHeight(F.byId.sofa), .9);
assert.equal(F.standHeight(F.byId.king_bed), .7);
assert.equal(F.standHeight(F.byId.wardrobe), undefined, 'tall cabinets are not landable');
const tvHouse = empty();
tvHouse.inventory = [{ id: 'tv-1', type: 'stream_tv', stream: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', startedAt: 123, queue: [{ provider: 'youtube', id: 'M7lc1UVf-VE', title: 'Demo video', addedBy: 'Tester' }] } }];
let tvPlaced = F.place(tvHouse, 'tv-1', { x: 0, z: -2, rot: 0 }); assert(tvPlaced.ok);
assert.equal(tvPlaced.house.furniture[0].stream.videoId, 'dQw4w9WgXcQ', 'stream data is carried into the room');
assert.equal(tvPlaced.house.furniture[0].stream.queue.length, 1, 'stream queue is carried into the room');
const tvNormalized = F.normalizeLayout(JSON.parse(JSON.stringify(tvPlaced.house.furniture)));
assert.equal(tvNormalized[0].stream.videoId, 'dQw4w9WgXcQ', 'stream data survives a restart');
assert.equal(tvNormalized[0].stream.queue[0].title, 'Demo video', 'stream queue survives a restart');
const tvStored = F.store(tvPlaced.house, 'tv-1'); assert(tvStored.ok);
assert.equal(tvStored.house.inventory[0].stream.videoId, 'dQw4w9WgXcQ', 'stream data survives storage');
assert.equal(tvStored.house.inventory[0].stream.queue.length, 1, 'stream queue survives storage');
const tvBack = F.place(tvStored.house, 'tv-1', { x: 0, z: -2, rot: 0 }); assert(tvBack.ok);
assert.equal(tvBack.house.furniture[0].stream.videoId, 'dQw4w9WgXcQ', 'stream data survives re-placement');
assert.equal(F.normalizeLayout([{ id: 'bad-tv', type: 'stream_tv', x: 0, z: 0, rot: 0, stream: { provider: 'youtube', videoId: 'https://evil.example' } }])[0].stream, undefined, 'invalid stream sources are dropped');
// The TV is stackable like a real set: it fits on both the TV stand and the
// console table, and its stream data survives the support round trip.
const tvStandHouse = empty();
tvStandHouse.inventory = [{ id: 'stand-1', type: 'tv_stand' }, { id: 'tv-stand-tv', type: 'stream_tv', stream: { provider: 'youtube', videoId: 'M7lc1UVf-VE', startedAt: 456 } }];
let standPlaced = F.place(tvStandHouse, 'stand-1', { x: 0, z: -2, rot: 0 }); assert(standPlaced.ok);
standPlaced = F.place(standPlaced.house, 'tv-stand-tv', { x: 0, z: 0, rot: 0, support: 'stand-1' }); assert(standPlaced.ok, 'TV fits on the TV stand');
let standTv = standPlaced.house.furniture.find(v => v.id === 'tv-stand-tv');
assert.equal(standTv.support, 'stand-1');
assert.equal(F.resolve(standPlaced.house.furniture, standTv).y, .6);
assert.equal(standTv.stream.videoId, 'M7lc1UVf-VE');
const consoleHouse = empty();
consoleHouse.inventory = [{ id: 'console-1', type: 'console_table' }, { id: 'tv-console', type: 'stream_tv', stream: { provider: 'twitch', twitchId: 'shroud', twitchKind: 'channel', startedAt: 789 } }];
let consolePlaced = F.place(consoleHouse, 'console-1', { x: 0, z: -2, rot: 0 }); assert(consolePlaced.ok);
consolePlaced = F.place(consolePlaced.house, 'tv-console', { x: 0, z: 0, rot: 0, support: 'console-1' }); assert(consolePlaced.ok, 'TV fits on the console table');
let consoleTv = consolePlaced.house.furniture.find(v => v.id === 'tv-console');
assert.equal(consoleTv.support, 'console-1');
assert.equal(F.resolve(consolePlaced.house.furniture, consoleTv).y, .9);
assert.equal(consoleTv.stream.twitchId, 'shroud');
// Wall-mounted Big Wall TV: stored at the wall plane, centred 2.85 up the wall,
// with the same stream queue as the other TVs.
const wallHouse = empty();
wallHouse.inventory = [{ id: 'wall-tv', type: 'wall_tv', stream: { provider: 'youtube', videoId: 'M7lc1UVf-VE', startedAt: 111, queue: [{ provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Next', addedBy: 'Tester' }] } }];
let wallPlaced = F.place(wallHouse, 'wall-tv', { x: 0, z: 0, rot: 0, wall: 'back' }); assert(wallPlaced.ok, 'wall TV can be hung on the back wall');
let wallTv = wallPlaced.house.furniture[0];
assert.equal(wallTv.wall, 'back'); assert.equal(wallTv.x, 0); assert.equal(wallTv.z, -4.9); assert.equal(wallTv.rot, 0);
assert.equal(F.resolve(wallPlaced.house.furniture, wallTv).y, 2.85, 'wall TV sits at the mounted height');
assert.equal(wallTv.stream.videoId, 'M7lc1UVf-VE'); assert.equal(wallTv.stream.queue.length, 1);
const wallNormalized = F.normalizeLayout(JSON.parse(JSON.stringify(wallPlaced.house.furniture)));
assert.equal(wallNormalized[0].wall, 'back'); assert.equal(wallNormalized[0].z, -4.9); assert.equal(wallNormalized[0].stream.queue[0].title, 'Next');
const leftHouse = empty();
leftHouse.inventory = [{ id: 'left-tv', type: 'wall_tv' }];
const leftPlaced = F.place(leftHouse, 'left-tv', { x: 0, z: 1, rot: 0, wall: 'left' }); assert(leftPlaced.ok, 'wall TV can be hung on the left wall');
assert.equal(leftPlaced.house.furniture[0].x, -5.9); assert.equal(leftPlaced.house.furniture[0].z, .4);
assert.equal(leftPlaced.house.furniture[0].rot, Math.PI / 2);
assert.equal(F.resolve(leftPlaced.house.furniture, leftPlaced.house.furniture[0]).y, 2.85);
const movedWall = F.move(wallPlaced.house, 'wall-tv', { x: 0, z: 1, rot: 0, wall: 'left' });
assert(movedWall.ok, 'wall TV can move to another wall');
assert.equal(movedWall.house.furniture[0].wall, 'left'); assert.equal(movedWall.house.furniture[0].x, -5.9); assert.equal(movedWall.house.furniture[0].z, .4);
const storedWall = F.store(movedWall.house, 'wall-tv'); assert(storedWall.ok);
assert.equal(storedWall.house.inventory[0].stream.videoId, 'M7lc1UVf-VE');
const rehungWall = F.place(storedWall.house, 'wall-tv', { x: 2, z: 0, rot: 0, wall: 'back' }); assert(rehungWall.ok, 'stored wall TV can be rehung');
assert.equal(rehungWall.house.furniture[0].wall, 'back'); assert.equal(rehungWall.house.furniture[0].z, -4.9); assert.equal(rehungWall.house.furniture[0].stream.queue.length, 1);
const twoWall = empty();
twoWall.inventory = [{ id: 'wall-a', type: 'wall_tv' }, { id: 'wall-b', type: 'wall_tv' }];
let twoPlaced = F.place(twoWall, 'wall-a', { x: 0, z: 0, rot: 0, wall: 'back' }); assert(twoPlaced.ok);
assert(!F.place(twoPlaced.house, 'wall-b', { x: 1, z: 0, rot: 0, wall: 'back' }).ok, 'wall TVs cannot overlap on the same wall');
assert(!F.collision([{ id: 'wt', type: 'wall_tv', x: 0, z: -4.9, rot: 0, wall: 'back' }], 0, -4.9), 'wall TVs do not block the floor');
console.log('PASS: 154-piece catalog; wall-mounted TV, stream TV floor/stand/console placement, stream persistence, standable tops, paid ownership, grid snapping, bounds/overlap/door protection, rotation, supported decorations, parent movement, storage, size-based furniture caps and single-draw catalog models.');

assert.equal(F.byId.wall_tv.w,9);assert.equal(F.byId.wall_tv.h,5.2);assert.equal(F.byId.wall_tv.screen.w,8.8);assert.equal(F.byId.wall_tv.screen.h,4.95);
