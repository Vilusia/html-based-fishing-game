const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(require.resolve('../exploration.js'),'utf8'),ruleContext=vm.createContext({window:{}});vm.runInContext(source,ruleContext);const {Finds,generate,REFRESH}=ruleContext.window.ExplorationRules;
test('seeded finds cover home and offshore land, reject water, slopes and obstructions, and reward offshore exploration',()=>{
 const anchors=[{x:0,z:0,radius:50,count:10},{x:200,z:0,radius:30,count:2,offshore:true}],sample=()=>2,clear=(x,y,z)=>x>10||z>10;
 const a=generate('room',0,anchors,sample,clear),b=generate('room',0,anchors,sample,clear),c=generate('room',1,anchors,sample,clear);
 assert.equal(JSON.stringify(a),JSON.stringify(b));assert.notEqual(JSON.stringify(a),JSON.stringify(c));assert.equal(a.length,12);assert(a.some(f=>f.x<80));assert(a.some(f=>f.x>100));
 for(const f of a){assert(clear(f.x,f.y,f.z));assert(f.amount>=50&&f.amount<=700);if(f.x>100)assert(f.amount>=150);assert.equal(f.y,2.06);}
 assert.equal(generate('room',0,anchors,()=>-4,()=>false).length,0);assert.equal(generate('room',0,anchors,(x,z)=>x*10,()=>true).length,0);
});
test('only a nearby player can claim a shared find; simultaneous claims pay one winner, late joiners see it gone',()=>{
 let now=1;const pos={a:{x:1,y:2,z:1},b:{x:1,y:2,z:1},far:{x:50,y:2,z:1},high:{x:1,y:20,z:1}},f={id:'0:0',type:'cache',x:1,y:2,z:1,amount:600};
 const authority=new Finds({session:'room',now:()=>now,generate:()=>[{...f}],position:id=>pos[id]});assert(!authority.claim('far',f.id));assert(!authority.claim('high',f.id));assert(!authority.claim('missing',f.id));assert(!authority.claim('a','forged'));
 assert(authority.claim('a',f.id));assert(!authority.claim('b',f.id));assert.equal(authority.snapshot('late').finds.length,0);assert.equal(authority.snapshot('a').award.amount,600);assert.equal(authority.snapshot('b').award,null);
 const receipt=authority.snapshot('a').award.id;assert(!authority.ack('b',receipt));assert(authority.snapshot('a').award);assert(authority.ack('a',receipt));assert(!authority.ack('a',receipt));
 now+=REFRESH;assert(authority.tick());assert.equal(authority.snapshot('late').finds.length,1);
});
test('refresh gives new find ids while pending receipts remain stable until saved',()=>{
 let now=10;const authority=new Finds({session:'s',now:()=>now,generate:cycle=>[{id:cycle+':0',type:'pouch',x:0,y:1,z:0,amount:100}],position:()=>({x:0,y:1,z:0})});authority.claim('a','0:0');const id=authority.snapshot('a').award.id;
 now+=REFRESH;authority.tick();assert(!authority.claim('a','0:0'));assert(authority.claim('a','1:0'));assert.equal(authority.snapshot('a').award.id,id);assert.equal(authority.pending.get('a').length,2);authority.ack('a',id);assert.notEqual(authority.snapshot('a').award.id,id);
});
function network(){
 let now=10000,serial=0,friend,host,dropAward=false,dropAck=false,saveOK=true,saved=null;const packets=[];
 function peer(id,hosting,save){
  class Clock extends Date{static now(){return now;}}
  const scene=new THREE.Scene(),player=new THREE.Group();scene.add(player);
  const other={friend:{lastSeen:now,lastData:{pos:{x:0,y:2,z:0}}}},clientConns=hosting?{friend:{open:true,send(msg){packets.push(structuredClone(msg));if(dropAward&&msg.award){dropAward=false;return;}friend?.api.host(structuredClone(msg));}}}:{};
  const c=vm.createContext({THREE,window:{Ocean:{layout:()=>({islands:[{x:200,z:0,radius:40,xScale:1,zScale:1}]}),inBounds:()=>true}},document:{getElementById:()=>({style:{display:'none'}})},Date:Clock,console:{warn(){}},crypto:{randomUUID:()=> 'session-'+(++serial)},myPeerId:id,currentRoomId:'room',isHost:hosting,hostConn:hosting?null:{open:true,send(msg){if(dropAck&&msg.type==='explore:ack'){dropAck=false;return;}host.api.client(id,msg);}},clientConns,otherPlayers:other,player,scene,ISLAND_RADIUS:100,isInVoid:false,isInLavaWorld:false,treeColliders:[],staticColliders:[],getTerrainHeight:()=>2,waterSurfaceAt:()=>null,staticColliderHits:()=>false,saveState:save||{money:0,explorationReceipts:[],explorationStats:{finds:0,money:0}},saveGame(){if(saveOK&&!hosting)saved=structuredClone(c.saveState);return saveOK;},showToast(){},interactTarget:null});
  vm.runInContext(source,c);return {c,api:c.window.Exploration,other,player,scene};
 }
 host=peer('host',true);friend=peer('friend',false);host.api.tick();friend.api.tick();
 const root=p=>p.scene.getObjectByName('explorationFinds'),first=()=>root(friend).children[0].userData.find;
 function near(find){friend.player.position.set(find.x,find.y,find.z);host.other.friend.lastSeen=now;host.other.friend.lastData.pos={x:find.x,y:find.y,z:find.z};}
 function collect(){const el={style:{display:'none'}},button={};friend.api.prompt(el,button);assert.equal(friend.c.interactTarget,'exploration');assert.equal(button.textContent,'SEARCH');friend.api.interact();}
 return {host,get friend(){return friend;},first,near,collect,root,packets,advance(ms){now+=ms;host.other.friend.lastSeen=now;},dropAward(){dropAward=true;},dropAck(){dropAck=true;},saveOK(v){saveOK=v;},reload(){friend=peer('friend',false,saved);return friend;}};
}
test('multiplayer collection removes the same find for everyone and saves only the collecting player reward',()=>{
 const r=network(),find=r.first();assert.equal(r.root(r.host).children.length,r.root(r.friend).children.length);r.near(find);r.collect();assert.equal(r.friend.c.saveState.money,find.amount);assert.equal(r.host.c.saveState.money,0);assert.equal(r.friend.c.saveState.explorationStats.finds,1);assert(!r.root(r.friend).children.some(m=>m.userData.find.id===find.id));assert(!r.root(r.host).children.some(m=>m.userData.find.id===find.id));
});
test('lost payouts and acknowledgments retry without duplicate money, including after client reload',()=>{
 const r=network(),find=r.first();r.near(find);r.dropAward();r.collect();assert.equal(r.friend.c.saveState.money,0);r.dropAck();r.advance(2000);r.host.api.tick();assert.equal(r.friend.c.saveState.money,find.amount);r.reload();r.advance(2000);r.host.api.tick();assert.equal(r.friend.c.saveState.money,find.amount);assert.equal(r.friend.c.saveState.explorationStats.finds,1);r.advance(2000);r.host.api.tick();r.friend.api.tick();assert.equal(r.packets.at(-1).award,null);
});
test('failed saves keep reward pending and house/remote collection spoofing is rejected',()=>{
 const r=network(),find=r.first();r.host.api.client('friend',{type:'explore:claim',id:find.id,amount:99999});assert.equal(r.friend.c.saveState.money,0);r.advance(300);r.near(find);r.host.other.friend.lastData.houseOwner='house';r.host.api.client('friend',{type:'explore:claim',id:find.id});assert.equal(r.friend.c.saveState.money,0);delete r.host.other.friend.lastData.houseOwner;r.advance(300);r.saveOK(false);r.collect();assert.equal(r.friend.c.saveState.money,find.amount);r.advance(2000);r.host.api.tick();assert(r.packets.at(-1).award);r.saveOK(true);r.advance(2000);r.host.api.tick();assert.equal(r.friend.c.saveState.money,find.amount);
});
test('find rendering hides underground worlds, cleans up on leaving, and ships desktop/mobile hooks',()=>{
 const r=network();r.friend.c.isInVoid=true;r.friend.api.tick();assert(r.root(r.friend).children.every(m=>!m.visible));r.friend.c.document.getElementById=()=>({style:{display:'flex'}});r.friend.api.tick();assert(!r.root(r.friend));
 const ui=fs.readFileSync(require.resolve('../ui.js'),'utf8');assert.equal((ui.match(/interactTarget==='exploration'/g)||[]).length,2);assert(ui.includes('Exploration.client(clientId,data)'));assert(ui.includes('Exploration.host(data)'));assert(ui.includes('saveState.explorationReceipts=Array.isArray'));
 for(const file of ['index.html','.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(require.resolve('../'+file),'utf8').includes('exploration.js'));
});
test('a late snapshot cannot restore a collected find, and changing to a custom level replaces the old shared layout',()=>{
 const r=network(),old=structuredClone(r.packets[0]),find=r.first();r.near(find);r.collect();r.friend.api.host(old);assert(!r.root(r.friend).children.some(m=>m.userData.find.id===find.id));
 const previous=r.root(r.host),level={size:64,grid:8,seaLevel:0,heights:Array(64).fill(2)},Level={cellCenter:(lv,x,z)=>({x:(x+.5)*8-32,z:(z+.5)*8-32})},customOcean={islands:[{x:200,z:0,radius:40,xScale:1,zScale:1}]};
 for(const p of [r.host,r.friend]){p.c.window.CUSTOM_LEVEL=level;p.c.window.Level=Level;p.c.window.customOcean=customOcean;}
 r.advance(2000);r.host.api.tick();assert.equal(previous.parent,null);assert.notEqual(r.root(r.host),previous);const finds=r.root(r.host).children.map(m=>m.userData.find);assert(finds.some(f=>Math.abs(f.x)<32&&Math.abs(f.z)<32),'authored custom land has rewards');assert(finds.some(f=>f.x>100),'custom offshore islands have rewards');assert.equal(r.root(r.host).children.length,r.root(r.friend).children.length);
});
