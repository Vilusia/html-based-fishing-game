const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ui.js'), 'utf8');
function slice(start, end) { const a = source.indexOf(start); return source.slice(a, source.indexOf(end, a)); }
function priceCtx(mult) {
    const c = vm.createContext({
        COOK_VALUE_MULT: 2.2,
        COOK_BURN_VALUE_MULT: 0.4,
        getFishByName: name => ({ 'Common Carp': { price: 100 }, 'Trout': { price: 40 } }[name] || null),
        tradingSellMultiplier: () => mult
    });
    vm.runInContext(slice('function getFishSellPrice(', 'function addFishToInventory('), c);
    return c;
}
test('trading raises merchant fish prices and composes with cooked values', () => {
    const base = priceCtx(1);
    assert.equal(base.getFishSellPrice('Common Carp'), 100);
    assert.equal(base.getFishSellPrice('Trout'), 40);
    const bonus = priceCtx(1.5);
    assert.equal(bonus.getFishSellPrice('Common Carp'), 150);
    assert.equal(bonus.getFishSellPrice('Trout'), 60);
    assert.equal(bonus.getFishSellPrice(''), 15, 'unknown fish still pays the minimum');
    assert.equal(bonus.getFishSellPrice('Cooked Common Carp'), Math.round(Math.round(100 * 2.2) * 1.5));
    assert.equal(bonus.getFishSellPrice('Burnt Common Carp'), Math.round(Math.round(100 * 0.4) * 1.5));
});
test('trading bonus starts at +1% per level and caps at +50%', () => {
    let c = vm.createContext({ getSkillLevel: () => 1 });
    vm.runInContext(slice('function tradingSellMultiplier(', 'function cookingBurnChance('), c);
    assert.equal(c.tradingSellMultiplier(), 1.01);
    c = vm.createContext({ getSkillLevel: () => 99 });
    vm.runInContext(slice('function tradingSellMultiplier(', 'function cookingBurnChance('), c);
    assert.equal(c.tradingSellMultiplier(), 1.5);
});
