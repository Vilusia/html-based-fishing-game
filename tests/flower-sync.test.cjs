const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ui.js'), 'utf8');
function slice(start, end) { const a = source.indexOf(start); return source.slice(a, source.indexOf(end, a)); }
function setup(host) {
    const events = [];
    const flower = { userData: { typeId: 'daisy', isPicked: false }, visible: true, scale: { set() { } } };
    const ctx = {
        window: {},
        pickableFlowers: [flower],
        FLOWER_TYPES: [{ id: 'daisy', name: 'Daisy', color: '#fff', xp: 5, price: 3 }],
        saveState: { flowerInventory: {}, invSlots: [], skills: {} },
        addSkillXP() { events.push('xp'); },
        ensureInventorySlots() { },
        autoSortInventory() { },
        saveGame() { },
        showToast() { events.push('toast'); },
        updateUI() { },
        respawnFlower() { events.push('respawn'); },
        setTimeout() { events.push('timer'); },
        isHost: host,
        hostConn: null,
        broadcastToClients(msg) { events.push('broadcast:' + msg.type); }
    };
    vm.createContext(ctx);
    vm.runInContext(slice('window.pickFlower =', 'window.actionBuyTool'), ctx);
    return { ctx, flower, events };
}
test('a local pick grants one flower, starts its respawn and tells the room', () => {
    const { ctx, flower, events } = setup(true);
    ctx.window.pickFlower(0);
    assert.equal(flower.userData.isPicked, true);
    assert.equal(flower.visible, false);
    assert.equal(ctx.saveState.flowerInventory.daisy, 1);
    assert(events.includes('timer'), 'respawn timer starts for every picker');
    assert(events.includes('toast'));
    assert(events.includes('broadcast:pick_flower'));
});
test('a network pick hides the flower without granting rewards or rebroadcasting', () => {
    const { ctx, flower, events } = setup(true);
    ctx.window.pickFlower(0, true);
    assert.equal(flower.userData.isPicked, true);
    assert.equal(flower.visible, false);
    assert.equal(ctx.saveState.flowerInventory.daisy, undefined, 'remote picks must not grant flowers');
    assert(!events.some(e => e.startsWith('broadcast')), 'remote picks must not echo');
    assert(!events.includes('toast'));
    assert(events.includes('timer'));
});
test('a guest sends the pick to the host instead of broadcasting', () => {
    const { ctx, events } = setup(false);
    ctx.hostConn = { open: true, send(msg) { events.push('send:' + msg.type); } };
    ctx.window.pickFlower(0);
    assert(events.includes('send:pick_flower'));
    assert(!events.some(e => e.startsWith('broadcast')));
});
