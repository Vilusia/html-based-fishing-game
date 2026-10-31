const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');const root=path.join(__dirname,'..');
function catalog(file,name){const source=fs.readFileSync(path.join(root,file),'utf8'),a=source.indexOf('const '+name+' = ['),b=source.indexOf('];',a)+2;return vm.runInNewContext(source.slice(a,b)+';'+name);}
function setup(){let now=Date.parse('2026-10-28T12:00:00-04:00'),saves=0;class Clock extends Date{static now(){return now;}}
 const nodes={},el=()=>({hidden:true,style:{},children:[],appendChild(v){this.children.push(v);},replaceChildren(){this.children=[];}});for(const id of ['halloween-overlay','halloween-wallet','halloween-progress','halloween-rewards','halloween-fish','halloween-hud'])nodes[id]=el();
 const ctx={THREE,window:{},Date:Clock,document:{getElementById:id=>nodes[id],createElement:el,exitPointerLock(){}},LAKE_RADIUS:20,player:new THREE.Group(),scene:new THREE.Scene(),saveGame:()=>saves++,updateCharacterPreview(){},showToast(){},updateSpriteDirection(){},saveState:{keybinds:{interact:'KeyE'},unlockedHats:['none'],unlockedShirts:['none'],unlockedPants:['none'],unlockedCollars:['none'],unlockedRods:['bamboo'],unlockedBobbers:['classic'],unlockedTitles:['none'],currentHat:'none',currentShirt:'none',currentPants:'none',currentCollar:'none',currentRod:'bamboo',currentBobber:'classic',currentTitle:'none'},FISH_NAME_MAP:new Map(),TITLE_MAP:new Map()};
 for(const [file,name] of [['core.js','BOBBER_TYPES'],['fish.js','FISH_TYPES'],['fish.js','HAT_TYPES'],['fish.js','SHIRT_TYPES'],['fish.js','PANTS_TYPES'],['fish.js','COLLAR_TYPES'],['fish.js','ROD_TYPES'],['fish.js','TITLE_TYPES']])ctx[name]=catalog(file,name);
 ctx.FISH_TYPES.forEach(f=>ctx.FISH_NAME_MAP.set(f.name,f));ctx.getFishByName=name=>ctx.FISH_NAME_MAP.get(name);
 const c=vm.createContext(ctx);for(const file of ['character3d.js','bobbers3d.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);c.Character3D=c.window.Character3D;c.Bobbers3D=c.window.Bobbers3D;
 c.createPlayerMesh=()=>{const group=new THREE.Group(),rod=new THREE.Group();rod.name='rod';group.add(rod);return group;};c.replaceCharacterBody=()=>{};
 const ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');vm.runInContext(ui.slice(ui.indexOf('function getDefaultNpcSpawns()'),ui.indexOf('function generateWorld(seedStr)')),c);
 vm.runInContext(fs.readFileSync(path.join(root,'halloween.js'),'utf8'),c);return {c,event:c.window.Halloween,nodes,setNow:value=>now=value,saves:()=>saves};}
test('event opens and closes on explicit New York dates, including daylight saving time',()=>{
 const {event:e}=setup();assert(!e.active(e.START-1));assert(e.active(e.START));assert(e.active(Date.parse('2026-11-08T23:59:59-05:00')));assert(!e.active(e.END));assert(!e.active(NaN));
 assert.equal(e.roll(.14,.5,e.START),null);assert.equal(e.roll(.1,.5,e.END),null);assert.equal(e.roll(.1,NaN,e.START),null);assert(e.roll(0,0,e.START));assert(e.roll(.1399,.9999,e.START));
});
test('catch currency rejects junk, rewards discoveries once and grants collection bonus once',()=>{
 const {event:e,c}=setup();e.restore({});assert.equal(e.caught({name:'Old Boot'}),0);assert.equal(e.caught({name:'fake'}),0);const normal={name:'Rainbow Trout'};assert.equal(e.caught(normal),2);assert.equal(e.caught(normal),0);
 let sum=2;for(const f of e.fish)sum+=e.caught({name:f.name});assert.equal(c.saveState[e.EVENT].embers,sum);assert.equal(c.saveState[e.EVENT].discovered.length,8);assert(c.saveState[e.EVENT].collectionClaimed);const before=c.saveState[e.EVENT].embers;e.caught({name:e.fish[0].name});assert.equal(c.saveState[e.EVENT].embers-before,e.fish[0].embers);
});
test('event vendor gates currency purchases and owned items remain equippable after expiry',()=>{
 const s=setup(),{c,event:e}=s;e.restore({});e.spawn(c.scene);c.player.position.copy(e.vendor.position);const item=e.rewards[0];assert.equal(e.buy(item.id),false);c.saveState[e.EVENT].embers=200;assert(e.buy(item.id));assert.equal(c.saveState[e.EVENT].embers,200-item.cost);assert(c.saveState.unlockedHats.includes(item.id));assert.equal(c.saveState.currentHat,item.id);assert(!e.buy(item.id));assert.equal(s.saves(),1);
 c.player.position.x+=20;assert(!e.buy(e.rewards[1].id));c.player.position.copy(e.vendor.position);s.setNow(e.END);assert(!e.buy(e.rewards[1].id));assert.equal(e.caught({name:'Rainbow Trout'}),0);e.tick(e.END);assert(!e.vendor.visible);assert(s.nodes['halloween-overlay'].hidden);c.saveState.currentHat='none';e.equip(item.id);assert.equal(c.saveState.currentHat,item.id);
});
test('saved currency is sanitized, never reset by an expired event, and invalid discoveries are removed',()=>{
 const {c,event:e}=setup();e.restore({[e.EVENT]:{embers:NaN,catches:-2,discovered:['fake',e.fish[0].name,e.fish[0].name]}});assert.equal(c.saveState[e.EVENT].embers,0);assert.equal(c.saveState[e.EVENT].catches,0);assert.equal(c.saveState[e.EVENT].discovered.length,1);
 e.restore({[e.EVENT]:{embers:123,catches:5,discovered:[e.fish[0].name]}});const saved=JSON.parse(JSON.stringify(c.saveState));e.restore(saved);assert.equal(c.saveState[e.EVENT].embers,123);
});
test('custom maps show only explicitly placed seasonal vendors with their saved position and rotation',()=>{
 const {c,event:e}=setup();c.window.CUSTOM_LEVEL={npcs:[]};c.window.Level={sampleHeight:()=>2};e.spawn(c.scene);assert(!e.vendor.visible);
 c.window.CUSTOM_LEVEL.npcs=[{type:'halloween',x:7,z:9,rot:1.2}];e.spawn(c.scene);assert(e.vendor.visible);assert.equal(e.vendor.position.x,7);assert.equal(e.vendor.position.y,2);assert.equal(e.vendor.position.z,9);assert.equal(e.vendor.rotation.y,1.2);
});
test('all event fish and rewards have registered catalogs and finite 3D visuals',()=>{
 const {c,event:e}=setup();assert.equal(e.fish.length,8);assert.equal(e.rewards.length,16);
 for(const f of e.fish){assert.equal(c.getFishByName(f.name),f);const model=c.Character3D.buildFish(f.name,f.color);assert.equal(model.userData.shape,f.shape);model.traverse(obj=>{if(obj.geometry)assert([...obj.geometry.attributes.position.array].every(Number.isFinite));});}
 for(const r of e.rewards){assert(r.event&&r.cost>0);if(r.kind==='bobber'){const model=c.Bobbers3D.build(r);assert(model.children.length>2);}if(r.kind==='rod')assert(c.Character3D.buildRod(r).getObjectByName('rodWrap'));}
});
test('event is included in both deploy methods and exposed in the shared editor NPC catalog',()=>{for(const file of ['index.html','.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('halloween.js'));const npc=catalog('worldgen.js','NPC_TYPES');assert.equal(npc[0].id,'merchant');assert(npc.some(n=>n.id==='halloween'));});

test('event cosmetics cannot be bought for regular cash and both interaction inputs open the vendor',()=>{
 const source=fs.readFileSync(path.join(root,'ui.js'),'utf8');
 for(const [catalog,owned] of [['PANTS_TYPES','unlockedPants'],['HAT_TYPES','unlockedHats'],['SHIRT_TYPES','unlockedShirts'],['COLLAR_TYPES','unlockedCollars'],['TITLE_TYPES','unlockedTitles'],['ROD_TYPES','unlockedRods'],['BOBBER_TYPES','unlockedBobbers']])assert(source.includes(catalog+'.filter(item=>!item.event||saveState.'+owned+'.includes(item.id))'));
 assert.equal((source.match(/interactTarget === 'halloween'/g)||[]).length,2);assert(source.includes('window.Halloween?.caught(minigame.targetFish)'));assert(source.includes('window.Halloween?.restore(d)'));
});
test('exclusive character cosmetics produce finite batched models in the same pipeline as regular items',()=>{
 const {c,event:e}=setup(),texture=()=>new THREE.Texture();
 for(const r of e.rewards.filter(r=>['hat','shirt','collar'].includes(r.kind))){const assets={headFront:texture(),headBack:texture(),torsoFront:texture(),torsoBack:texture(),[r.kind]:r};
 const body=c.Character3D.buildCharacter({[r.kind]:r.id},{base:'#c28544',belly:'#edd9c2',parts:'fox',pc:{}},assets);assert(body.userData.drawCalls<=3);body.traverse(obj=>{if(obj.geometry)assert([...obj.geometry.attributes.position.array].every(Number.isFinite));});}
});

test('four Halloween pants match event outfits, cost Embers only, and remain equippable after expiry',()=>{
 const s=setup(),{c,event:e}=s,pants=e.rewards.filter(r=>r.kind==='pants');assert.equal(pants.length,4);
 const hoodie=e.rewards.find(r=>r.id==='ht_hoodie'),coat=e.rewards.find(r=>r.id==='ht_coat');assert.equal(pants.find(r=>r.id==='ht_ghost_pants').color,hoodie.color);assert.equal(pants.find(r=>r.id==='ht_harvest_pants').color,coat.color);
 e.restore({});e.spawn(c.scene);c.player.position.copy(e.vendor.position);c.saveState[e.EVENT].embers=500;c.saveState.money=100000;
 const ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');vm.runInContext(ui.slice(ui.indexOf('function restorePants('),ui.indexOf('function paintPants(')),c);
 for(const item of pants){assert(!c.selectPants(item.id),'regular cash cannot buy an unowned event pair');const before=c.saveState[e.EVENT].embers;assert(e.buy(item.id));assert.equal(c.saveState[e.EVENT].embers,before-item.cost);assert.equal(c.saveState.currentPants,item.id);assert(!e.buy(item.id));}
 assert.equal(c.saveState.money,100000);const saved=JSON.parse(JSON.stringify(c.saveState));c.restorePants(saved);assert(c.saveState.unlockedPants.includes(pants[0].id));s.setNow(e.END);c.saveState.currentPants='none';e.equip(pants[0].id);assert.equal(c.saveState.currentPants,pants[0].id);
 c.saveState.unlockedPants=['none'];assert(!e.buy(pants[1].id),'expired event cannot sell pants');
});

test('festival closes live at the New York cutoff, refreshing an open regular shop exactly once',()=>{
 const s=setup(),{c,event:e,nodes}=s;e.restore({});e.spawn(c.scene);c.player.position.copy(e.vendor.position);c.saveState.unlockedHats.push('ht_witch');c.saveState.unlockedPants.push('ht_ghost_pants');c.saveState.currentHat='ht_witch';c.saveState.currentPants='ht_ghost_pants';
 nodes['shop-overlay']={style:{display:'flex'}};nodes['npc-prompt']={style:{display:'block'}};c.interactTarget='halloween';let refreshes=0;const messages=[];c.renderShop=()=>refreshes++;c.showToast=text=>messages.push(text);
 s.setNow(e.END-1000);e.tick(e.END-1000);messages.length=0;nodes['halloween-overlay'].hidden=false;
 s.setNow(e.END);e.tick(e.END);assert(!e.vendor.visible);assert(nodes['halloween-overlay'].hidden);assert(nodes['halloween-hud'].hidden);assert.equal(c.interactTarget,null);assert.equal(nodes['npc-prompt'].style.display,'none');assert.equal(refreshes,1);assert.equal(messages.length,1);assert(messages[0].includes('regular shop'));assert.equal(c.saveState.currentPants,'ht_ghost_pants');assert(c.saveState.unlockedHats.includes('ht_witch'));
 e.tick(e.END+1000);assert.equal(refreshes,1);assert.equal(messages.length,1);
 c.saveState.currentHat='none';e.equip('ht_witch');assert.equal(c.saveState.currentHat,'ht_witch');assert(!e.buy('ht_crown'));assert.equal(e.roll(0,0,e.END),null);
});
test('opening the game after the festival keeps owned rewards without announcing a new ending',()=>{
 const s=setup(),{c,event:e}=s;let notices=0;c.showToast=()=>notices++;s.setNow(e.END+86400000);e.restore({});e.spawn(c.scene);e.tick(e.END+86400000);assert(!e.vendor.visible);assert.equal(notices,0);
});

test('custom event vendor world facing matches the editor across every quadrant',()=>{
 const {c,event:e}=setup();c.window.Level={sampleHeight:()=>2};
 for(const rot of [0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,-Math.PI/4,-Math.PI/2,Math.PI*2]){
  c.window.CUSTOM_LEVEL={npcs:[{type:'halloween',x:7,z:9,rot}]};e.spawn(c.scene);
  const facing=e.vendor.getWorldDirection(new THREE.Vector3()),expected=new THREE.Vector3(Math.sin(rot),0,Math.cos(rot));
  assert(facing.distanceTo(expected)<1e-8,'event vendor must match the saved world direction');
  assert.equal(e.vendor.rotation.x,0);assert.equal(e.vendor.rotation.z,0);
 }
});
