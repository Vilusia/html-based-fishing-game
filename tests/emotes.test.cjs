const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../emotes.js'),'utf8');
function setup(){let now=10000,saves=0,renders=0;const poses=[];function element(){return {hidden:true,style:{},children:[],appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];},setAttribute(){}};}
 const nodes={};for(const id of ['emote-overlay','emote-wheel','emote-choices'])nodes[id]=element();
 const player=new THREE.Group(),body=new THREE.Group();body.name='playerSprite';body.userData.is3D=true;player.add(body);
 const c=vm.createContext({window:{Character3D:{animateEmote:(body,id,time)=>poses.push({body,id,time})}},saveState:{money:2000,unlockedEmotes:[],emoteWheel:[null,null,null,null,null]},player,playerVelocity:{y:0},otherPlayers:{},isDiving:false,isProne:false,isSailing:false,isGuitarActive:false,isGloveActive:false,fishingState:'idle',performance:{now:()=>now},document:{getElementById:id=>nodes[id],createElement:element,createElementNS:element,exitPointerLock(){}},saveGame:()=>saves++,renderShop:()=>renders++,showToast(){},sendUpdate(){}});vm.runInContext(source,c);
 return {c,api:c.window.Emotes,body,poses,nodes,advance:ms=>now+=ms,saves:()=>saves,renders:()=>renders};
}
test('emotes can be bought once, saved, and assigned only when owned',()=>{
 const s=setup();assert.equal(s.api.catalog.length,25);s.api.buy('wave');assert.equal(s.c.saveState.money,1900);assert.equal(s.c.saveState.emoteWheel[0],'wave');s.api.buy('wave');assert.equal(s.c.saveState.money,1900);
 s.api.assign(4,'wave');assert.equal(s.c.saveState.emoteWheel[4],'wave');s.api.assign(3,'dance');assert.equal(s.c.saveState.emoteWheel[3],null);s.api.assign(9,'wave');s.api.assign(4,null);assert.equal(s.c.saveState.emoteWheel[4],null);
 s.c.saveState.money=0;s.api.buy('dance');assert(!s.c.saveState.unlockedEmotes.includes('dance'));s.api.buy('unknown');assert.equal(s.saves(),3);
});
test('save restoration filters unknown and unowned wheel entries',()=>{
 const s=setup();s.api.restoreSave({unlockedEmotes:['wave','wave','fake'],emoteWheel:['dance','wave','fake']});assert.equal(s.c.saveState.unlockedEmotes.length,1);assert.equal(s.c.saveState.emoteWheel.length,5);assert.equal(s.c.saveState.emoteWheel[0],null);assert.equal(s.c.saveState.emoteWheel[1],'wave');
});
test('local emotes expire and moving cancels playback and its network state',()=>{
 const s=setup();s.api.buy('wave');s.api.play('wave');assert.equal(s.api.networkState().id,'wave');s.advance(500);s.api.tick();assert.equal(s.poses.at(-1).id,'wave');assert.equal(s.api.networkState().elapsed,.5);
 s.c.player.position.x=.2;s.api.tick();assert.equal(s.api.networkState(),null);assert.equal(s.poses.at(-1).id,null);
 s.api.play('wave');s.advance(3100);s.api.tick();assert.equal(s.api.networkState(),null);
});
test('peers use elapsed timing and cannot replay stale expired or invalid packets',()=>{
 const s=setup(),peer=new THREE.Group(),body=new THREE.Group();body.name='playerSprite';body.userData.is3D=true;peer.add(body);s.c.otherPlayers.p={mesh:peer,lastData:{emote:{id:'wave',token:'one',elapsed:1}}};
 s.api.tick();assert.equal(s.poses.at(-1).time,1);s.advance(500);s.api.tick();assert.equal(s.poses.at(-1).time,1.5);s.advance(1600);s.api.tick();const length=s.poses.length;s.api.tick();assert.equal(s.poses.length,length,'stale token cannot restart');
 s.c.otherPlayers.p.lastData.emote={id:'cheer',token:'two',elapsed:.25};s.api.tick();assert.equal(s.poses.at(-1).id,'cheer');assert.equal(s.poses.at(-1).time,.25);
 s.c.otherPlayers.p.lastData.emote={id:'fake',token:'x',elapsed:0};s.api.tick();assert.equal(s.poses.at(-1).id,null);
});

test('all 25 emotes can be bought, restored, assigned and played by a peer',()=>{
 const s=setup();s.c.saveState.money=50000;
 const peer=new THREE.Group(),body=new THREE.Group();body.name='playerSprite';body.userData.is3D=true;peer.add(body);s.c.otherPlayers.p={mesh:peer,lastData:{}};
 const ids=new Set();
 for(const item of s.api.catalog){
  assert(!ids.has(item.id));ids.add(item.id);assert(item.price>0&&item.duration>0);
  s.api.buy(item.id);s.api.assign(0,item.id);assert.equal(s.c.saveState.emoteWheel[0],item.id);
  s.c.otherPlayers.p.lastData.emote={id:item.id,token:item.id,elapsed:.4};s.api.tick();assert.equal(s.poses.at(-1).id,item.id);
  assert([body.position.y,body.rotation.x,body.rotation.y,body.rotation.z].every(Number.isFinite));
 }
 const saved=JSON.parse(JSON.stringify(s.c.saveState));s.api.restoreSave(saved);assert.equal(s.c.saveState.unlockedEmotes.length,25);assert.equal(s.c.saveState.emoteWheel[0],'airplane');
});

test('the wheel opens, navigates and plays while leaving the HUD hidden',()=>{
 const s=setup(),classes=new Set();s.c.hudVisible=false;s.c.document.body={classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
 s.api.buy('wave');s.api.buy('cheer');s.api.toggle();assert.equal(s.nodes['emote-overlay'].hidden,false);assert(classes.has('emote-wheel-open'));
 s.api.moveSelection(1);s.api.select();assert.equal(s.api.networkState().id,'cheer');assert.equal(s.nodes['emote-overlay'].hidden,true);assert(!classes.has('emote-wheel-open'));assert.equal(s.c.hudVisible,false);
});
test('empty radial slots open assignment and can be filled then played',()=>{
 const s=setup();s.api.buy('wave');s.api.toggle();s.api.select(4);assert.equal(s.nodes['emote-choices'].hidden,false);
 const choice=s.nodes['emote-choices'].children.find(el=>el.textContent==='Wave');assert(choice);choice.onclick();assert.equal(s.c.saveState.emoteWheel[4],'wave');assert.equal(s.nodes['emote-choices'].hidden,true);
 s.api.close();s.api.toggle();s.api.select(4);assert.equal(s.api.networkState().id,'wave');assert.equal(s.nodes['emote-overlay'].hidden,true);
});
