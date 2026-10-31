const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
function setup(){
 const card=(text,action,selected=false)=>({textContent:text,dataset:{},hidden:false,classList:{contains:()=>selected},querySelector:()=>({textContent:action})});
 const entries=[card('Straw Hat Equipped','Equipped',true),card('Blue Cap Equip','Equip'),card('Red Cap $100','$100'),card('Fishing Crown Claim Reward!','Claim Reward!'),card('Acoustic Guitar Owned','Owned')];
 const nodes={'shop-container':{querySelectorAll:()=>entries},'shop-search':{value:''},'shop-filter':{value:'all'},'shop-results':{},'shop-empty':{}};
 const context=vm.createContext({window:{},document:{getElementById:id=>nodes[id]}});
 vm.runInContext(source.slice(source.indexOf('    window.filterShopItems ='),source.indexOf('    window.renderShop =')),context);
 return {entries,nodes,filter:context.window.filterShopItems};
}
test('shop search ignores case and combines with ownership filters',()=>{
 const {entries,nodes,filter}=setup();nodes['shop-search'].value='  CAP ';filter();assert.deepEqual(entries.map(e=>e.hidden),[true,false,false,true,true]);assert.equal(nodes['shop-results'].textContent,'2 of 5 items');
 nodes['shop-filter'].value='owned';filter();assert.deepEqual(entries.map(e=>e.hidden),[true,false,true,true,true]);
 nodes['shop-filter'].value='available';filter();assert.deepEqual(entries.map(e=>e.hidden),[true,true,false,true,true]);
});
test('equipped cosmetics and owned tools count as owned; unclaimed rewards do not',()=>{
 const {entries,nodes,filter}=setup();nodes['shop-filter'].value='owned';filter();assert.deepEqual(entries.map(e=>e.hidden),[false,false,true,true,false]);
 nodes['shop-filter'].value='available';filter();assert.deepEqual(entries.map(e=>e.hidden),[true,true,false,false,true]);
});
test('empty state clears when search and filter reset',()=>{
 const {entries,nodes,filter}=setup();nodes['shop-search'].value='missing';filter();assert.equal(nodes['shop-empty'].hidden,false);assert.equal(nodes['shop-results'].textContent,'0 of 5 items');
 nodes['shop-search'].value='';filter();assert.equal(nodes['shop-empty'].hidden,true);assert(entries.every(e=>!e.hidden));
});

test('wearable shop cards use shared 3D thumbnails instead of 2D character art',()=>{
 assert(source.includes("createCharacterThumbnail({currentHat:hat.id},'head',96,128,'shop')"));
 assert(source.includes("createCharacterThumbnail({currentShirt:shirt.id},'full',96,128,'shop')"));
 assert(source.includes("createCharacterThumbnail({currentPants:item.id},'full',96,128,'shop')"));
 assert(source.includes("createCharacterThumbnail({currentCollar:item.id},'full',96,128,'shop')"));
 assert(!source.includes('drawHat(ctx, hat.id'));
 assert(!source.includes('drawSpecies(ctx, { ears: saveState.currentEars'));
 assert(source.includes("CharacterThumbnails?.cancel?.('shop')"));
});

test('owned seasonal shop cards carry their collection badge across all seven cosmetic categories',()=>{
 const context=vm.createContext({document:{createElement:()=>({})}}),a=source.indexOf('    function appendEventShopBadge('),b=source.indexOf('    window.filterShopItems',a);vm.runInContext(source.slice(a,b),context);
 const entry={children:[],appendChild(node){this.children.push(node);}};context.appendEventShopBadge(entry,{id:'ordinary'});assert.equal(entry.children.length,0);context.appendEventShopBadge(entry,{event:'hollowtide2026'});assert.equal(entry.children[0].textContent,'Hollowtide 2026');assert.equal(entry.children[0].className,'shop-event-badge');assert.equal((source.match(/appendEventShopBadge\(entry,(?:item|shirt|hat|title)\);/g)||[]).length,7);
});
