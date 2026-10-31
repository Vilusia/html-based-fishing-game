const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ui.js'), 'utf8');
const code = source.slice(source.indexOf('let gameAnchorSyncTimer'), source.indexOf('function startGame()', source.indexOf('let gameAnchorSyncTimer')));

function setup() {
    let space = '';
    let anchor = { status: 'displayed', top: 750, height: 50 };
    const ad = {
        getAttribute: () => anchor.status,
        getBoundingClientRect: () => ({ top: anchor.top, height: anchor.height, bottom: anchor.top + anchor.height }),
        querySelectorAll: () => [],
        parentElement: null
    };
    const body = {
        classList: { contains: () => true },
        style: { setProperty: (_name, value) => { space = value; } }
    };
    const ctx = vm.createContext({
        window: { innerHeight: 800, matchMedia: () => ({ matches: false }), addEventListener() {} },
        document: {
            body,
            documentElement: {},
            querySelectorAll: (selector) => selector === '[data-anchor-status]' ? [ad] : []
        },
        getComputedStyle: () => ({ position: 'fixed' }),
        setInterval: () => 1,
        clearInterval() {}
    });
    vm.runInContext(code, ctx);
    return { ctx, body, setAnchor: (next) => { anchor = { ...anchor, ...next }; }, space: () => space };
}

test('anchor ad height drives the HUD safe strip and releases it when collapsed or dismissed', () => {
    const s = setup();
    s.ctx.syncGameAnchorSpace();
    assert.equal(s.space(), '64px');

    s.setAnchor({ top: 700, height: 100 });
    s.ctx.syncGameAnchorSpace();
    assert.equal(s.space(), '114px');

    s.setAnchor({ top: 750, height: 50, status: 'displayed' });
    s.ctx.syncGameAnchorSpace();
    assert.equal(s.space(), '64px');

    s.setAnchor({ status: 'dismissed', top: 800, height: 0 });
    s.ctx.syncGameAnchorSpace();
    assert.equal(s.space(), '0px');
});
