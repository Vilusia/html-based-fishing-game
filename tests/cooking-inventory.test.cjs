const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('ui.js','utf8').replace(/\r\n/g,'\n');
function fn(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function setup(){
 const state={inventory:[{name:'Bass',tag:1},{name:'Bass',tag:2},{name:'Trout',tag:3}],invSlots:[{type:'fish',name:'Bass',count:2},{type:'fish',name:'Trout',count:1},null],hotbar:[],money:0};
 const ctx={window:{},saveState:state,document:{getElementById:()=>({style:{display:'flex'}})},ensureInventorySlots(){},renderCookingUI(){ctx.renders++},renders:0,autoSortInventory(){},saveGame(){},Sound:{sell(){}},showToast(){},updateMerchantUI(){},updateHotbarVisuals(){},npcMerchant:null,getFishSellPrice:n=>({Bass:10,Trout:25}[n]||1),isCookableFish:f=>f&&!f.cooked&&!f.burnt,updateCookingMinigameUI(){},makeCookedFish:(f,b)=>({...f,name:(b?'Burnt ':'Cooked ')+f.name,cooked:true}),addSkillXP(){},updateUI(){},cancelAnimationFrame(){}};
 vm.createContext(ctx);
 vm.runInContext(fn('function reconcileFishInventory()', 'window.sellOneFish ='),ctx);
 for(const name of ['sellOneFish','sellFishSpecies','sellAllFish','actionSellFish','doCookingHit']){const start='window.'+name+' =';const i=source.indexOf(start);vm.runInContext(source.slice(i,source.indexOf('\n};',i)+4),ctx);}
 return ctx;
}
let c=setup();c.window.sellOneFish('Bass');assert.equal(c.saveState.inventory.length,2);assert.equal(c.saveState.inventory[0].tag,1);assert.equal(c.renders,1);assert.equal(c.saveState.money,10);assert.equal(vm.runInContext('availableCookingFish().length',c),2);
c.window.sellFishSpecies('Bass');assert.equal(c.saveState.inventory.length,1);assert.equal(c.saveState.inventory[0].name,'Trout');
for(const action of ['sellAllFish','actionSellFish']){c=setup();c.window[action]();assert.equal(c.saveState.money,45);assert.equal(c.saveState.inventory.length,0);assert.equal(vm.runInContext('availableCookingFish().length',c),0);}
c=setup();c.saveState.inventory.push({name:'Ghost'},{name:'Bass'});assert.equal(vm.runInContext('availableCookingFish().length',c),3,'legacy ghost fish must not appear');
c=setup();const sold=c.saveState.inventory[0],remaining=c.saveState.inventory[2];c.window.sellFishSpecies('Bass');c.cookingMini={active:true,pos:50,zoneLeft:40,zoneWidth:20,items:[{idx:0,f:sold},{idx:2,f:remaining}],results:[true],currentIdx:1};c.window.doCookingHit();assert.equal(c.saveState.inventory.length,1);assert.equal(c.saveState.inventory[0].name,'Cooked Trout','resolve surviving fish by identity after sale shifts its index');assert(!c.saveState.invSlots.some(s=>s?.name==='Cooked Bass'),'sold batch fish cannot become meals');
console.log('Cooking inventory regression tests passed');
