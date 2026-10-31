const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const guardCode=fs.readFileSync(require.resolve('../network-guard.js'),'utf8'),propsCode=fs.readFileSync(require.resolve('../props.js'),'utf8'),ui=fs.readFileSync(require.resolve('../ui.js'),'utf8');
function guard(){let now=0;const kicked=[],c=vm.createContext({window:{}});vm.runInContext(guardCode,c);const api=new c.window.NetworkGuardRules.Guard({now:()=>now,device:id=>id+'-device',kick:(id,reason)=>kicked.push({id,reason})});return {api,kicked,rules:c.window.NetworkGuardRules,advance:ms=>now+=ms};}
test('normal movement, control messages, payouts and dense MIDI stay connected despite jitter',()=>{
 const s=guard();
 for(let i=0;i<1200;i++){
  s.advance(50);assert(s.api.accept('normal',{type:'update',payload:{pos:{x:1,y:2,z:3}}}));
  for(let n=0;n<5;n++)s.api.accept('normal',{type:'sound',name:'guitar',var:440,pos:{x:1,y:2,z:3}});
  if(i%2===0)assert(s.api.accept('normal',{type:'boat:input',throttle:1,steer:0}));
  if(i%20===0)assert(s.api.accept('normal',{type:'tournament:ack',awardId:'room:round:normal'}));
  if(i%100===0)assert(s.api.accept('normal',{type:'explore:sync'}));
 }
 assert.equal(s.kicked.length,0);
 const jitter=guard();for(let round=0;round<30;round++){for(let n=0;n<40;n++)assert(jitter.api.accept('jitter',{type:'update',payload:{pos:{x:0,y:0,z:0}}}));jitter.advance(2000);}assert.equal(jitter.kicked.length,0);
});
test('a high-ping stall can release its queued updates without triggering a kick, but sustained spam still does',()=>{
 const s=guard();assert(s.api.accept('laggy',{type:'update',payload:{pos:{x:0,y:0,z:0}}}));
 s.advance(8000);
 let accepted=0;for(let i=0;i<300;i++)if(s.api.accept('laggy',{type:'update',payload:{pos:{x:1,y:2,z:3}}}))accepted++;
 assert(accepted>=260,'queued update burst should pass');assert.equal(s.kicked.length,0,'normal lag recovery must not kick');
 for(let i=0;i<500;i++)s.api.accept('laggy',{type:'update',payload:{pos:{x:1,y:2,z:3}}});
 assert.equal(s.kicked.length,1,'sustained post-recovery flooding must still kick');
});
test('fast prop, namespace, unknown-type and aggregate floods kick once and cannot bypass budgets',()=>{
 for(const type of ['placeProp','house:update','tournament:sync','explore:claim','boat:input']){
  const s=guard();let accepted=0;for(let i=0;i<500;i++)if(s.api.accept('bad',{type}))accepted++;
  assert.equal(s.kicked.length,1,type);assert(accepted<60,type+' bounded work');assert(!s.api.accept('bad',{type:'update'}));assert(s.api.blockedJoin('bad','other-device'));assert(s.api.blockedJoin('new-id','bad-device'));
  s.api.forget('bad');assert(s.api.blockedJoin('new-id','bad-device'));s.advance(120001);assert(!s.api.blockedJoin('new-id','bad-device'));
 }
 const s=guard();for(let i=0;i<100;i++)s.api.accept('types',{type:'madeup'+i});assert.equal(s.kicked.length,1);assert(s.api.users.get('types').buckets.size<=3,'type rotation cannot allocate unbounded buckets');
});
test('malformed, cyclic, oversized, deeply nested and nonfinite packets are bounded before gameplay',()=>{
 const s=guard(),cycle={type:'update'};cycle.self=cycle;const deep={type:'update'};let at=deep;for(let i=0;i<30;i++)at=at.next={};
 for(const msg of [null,[],{type:'update',payload:{pos:{x:Infinity,y:0,z:0}}},{type:'chat',text:'x'.repeat(9000)},{type:'update',data:Array(50000).fill(1)},cycle,deep,JSON.parse('{"type":"update","payload":{"__proto__":{}}}')])assert.equal(s.rules.packetCost(msg),null);
 const house={type:'house:update',house:{furniture:Array.from({length:600},(_,i)=>({id:'piece-'+i,type:'wall',x:i,y:0,z:0,rotation:0})),inventory:[]}};assert(s.rules.packetCost(house)>0,'large legitimate house saves still fit');
 for(let i=0;i<4;i++)s.api.accept('bad',{type:'chat',text:'x'.repeat(9000)});assert.equal(s.kicked.length,1);
});
function placements(){
 let now=10000;class Clock extends Date{static now(){return now;}}
 const sent=[],toasts=[],c=vm.createContext({THREE,window:{getTerrainHeight:()=>2,Ocean:{inBounds:(x,z)=>Math.abs(x)<=1000&&Math.abs(z)<=1000}},document:{addEventListener(){}},Date:Clock,Math,console,saveState:{money:5000,unlockedProps:['bush','chair','screen']},saveGame(){},showToast:t=>toasts.push(t),scene:new THREE.Scene(),player:{position:new THREE.Vector3(0,2,0),rotation:{y:0}},lastPropTime:0,PROP_COOLDOWN:500,isHost:true,hostConn:null,myDeviceID:'host-device',myPeerId:'host',isInVoid:false,isInLavaWorld:false,getTerrainHeight:()=>2,waterSurfaceAt:()=>null,WorldGen:{makeBuilding:()=>new THREE.Group()},clientConns:{peer:{peer:'peer',open:true,deviceID:'peer-device',send:m=>sent.push(m)}},otherPlayers:{peer:{lastData:{pos:{x:0,y:2,z:0}}}},broadcastToClients:m=>sent.push(m)});
 vm.runInContext(fs.readFileSync(require.resolve('../outdoor-props.js'),'utf8'),c);vm.runInContext(propsCode,c);
 const a=ui.indexOf("} else if (data.type === 'placeProp')"),b=ui.indexOf("} else if(data.type==='ytPlayback')",a);vm.runInContext('function handlePlacement(data,clientId){'+ui.slice(a,b).replace(/^\} else if \(data.type === 'placeProp'\) \{/, '')+'}',c);
 return {c,sent,toasts,advance:ms=>now+=ms,request:(type='house',id='home-one')=>({propType:type,propId:id,x:0,z:type==='house'?8:0,rot:0,unlockedProps:['bush','chair','screen'],placer:'spoofed-device'})};
}
test('host and solo players can place only one home; undo allows another',()=>{
 const {c,advance}=placements();assert(c.placeProp('house'));advance(500);assert.equal(c.placeProp('house'),false);assert.equal(c.scene.children.length,1);c.undoProp();assert.equal(c.scene.children.length,0);assert(c.placeProp('house'));
 c.isHost=false;c.undoProp();assert.equal(c.scene.children.length,0);advance(500);assert(c.placeProp('house'));assert.equal(c.placeProp('house'),false);
});
test('remote home limit, ids, coordinates, player/room caps and identity are validated before allocating',()=>{
 const {c,request}=placements();c.handlePlacement(request(),'peer');assert.equal(c.scene.children.length,1);assert.equal(c.scene.children[0].userData.propData.placer,'peer-device');
 c.handlePlacement(request('house','home-two'),'peer');assert.equal(c.scene.children.length,1);
 for(const bad of [{...request('bush','far'),x:500},{...request('bush','dup'),x:NaN},request('bush','__proto__'),request('unknown','bad'),request('bush','home-one')])assert(!c.validateRemotePropPlacement('peer',bad).ok);
 for(let i=0;i<9;i++)c.handlePlacement(request('bush','bush-'+i),'peer');assert.equal(c.scene.children.length,10);assert(!c.validateRemotePropPlacement('peer',request('bush','extra')).ok);assert.equal(c.scene.children.length,10);
 c.removePropsOwnedBy('peer');assert.equal(c.scene.children.length,0);assert(c.validateRemotePropPlacement('peer',request('house','fresh')).ok);
 for(let i=0;i<100;i++)c.spawnPropMesh({id:'room-'+i,type:'bush',x:20,z:20,placer:'other'});assert(!c.validateRemotePropPlacement('peer',request('bush','room-overflow')).ok);assert.equal(c.scene.children.length,100);
});
test('pending home requests block repeated clicks and host rejection clears the pending slot',()=>{
 const {c,advance,sent}=placements();c.isHost=false;c.hostConn={open:true,send:m=>sent.push(m)};assert(c.placeProp('house'));advance(1000);assert.equal(c.placeProp('house'),false);assert.equal(sent.length,1);
 c.window.propPlacementNotice({id:sent[0].propId,message:'Rejected'});assert(c.placeProp('house'));const req=sent.at(-1);c.spawnPropMesh({id:req.propId,type:'house',x:0,z:8,owner:'host',placer:'host-device'});advance(1000);assert.equal(c.placeProp('house'),false);
});
test('guard runs before namespace dispatch and kicks immediately clear only the offender props and connection',()=>{
 const {c,request,sent}=placements();c.handlePlacement(request(),'peer');c.spawnPropMesh({id:'host-bush',type:'bush',x:0,z:0,placer:'host-device'});
 const calls=[];c.window.NetworkGuard={forget:id=>calls.push('forget:'+id)};c.rateLimits={peer:{}};c.broadcastPlayerList=()=>{};c.updateHostPanel=()=>{};c.publishLobby=()=>{};c.removePlayer=id=>{c.removePropsOwnedBy(id);delete c.otherPlayers[id];};c.clientConns.peer.close=()=>calls.push('close');
 const a=ui.indexOf('function cleanupPeerConnection('),b=ui.indexOf('function removePlayer(',a);vm.runInContext(ui.slice(a,b),c);c.window.disconnectAbusivePeer('peer','packet flooding');assert(!c.clientConns.peer);assert.equal(c.scene.children.length,1);assert.equal(c.scene.children[0].userData.propData.id,'host-bush');assert(calls.includes('close'));assert(sent.some(m=>m.type==='propRemoved'));assert(sent.some(m=>m.type==='error'));
 const start=ui.indexOf('function handleDataFromClient('),end=ui.indexOf('function handleDataFromHost(',start),body=ui.slice(start,end);assert(body.indexOf('NetworkGuard.accept')<body.indexOf('Exploration.client'));assert(body.indexOf('NetworkGuard.accept')<body.indexOf('Tournaments.client'));assert(body.indexOf('NetworkGuard.accept')<body.indexOf('Housing.handleClient'));
});
test('real inbound dispatcher blocks flooding before tournament and exploration handlers run',()=>{
 for(const [type,namespace] of [['tournament:cast','Tournaments'],['explore:sync','Exploration']]){
  let forwarded=0,kicked=0;const c=vm.createContext({window:{},Date:{now:()=>1000},isHost:true,clientConns:{bad:{open:true,deviceID:'bad-device'}}});
  vm.runInContext(guardCode,c);c.NetworkGuard=c.window.NetworkGuard;c.window.disconnectAbusivePeer=()=>{kicked++;delete c.clientConns.bad;};c[namespace]=c.window[namespace]={client(){forwarded++;}};
  const a=ui.indexOf('function handleDataFromClient('),b=ui.indexOf('function handleDataFromHost(',a);vm.runInContext(ui.slice(a,b),c);
  for(let i=0;i<1000;i++)c.handleDataFromClient('bad',{type,token:'x',hour:0});assert.equal(kicked,1);assert(forwarded<=4);assert(!c.clientConns.bad);
 }
});
test('screen queues and sound payloads have bounded valid shapes, and outdoor screen cap is authoritative',()=>{
 const s=guard();assert.equal(s.rules.packetCost({type:'sound',name:'guitar',pos:{x:0,y:0,z:0},var:1e100}),null);assert.equal(s.rules.packetCost({type:'update',payload:{pos:{x:0,y:1e100,z:0}}}),null);
 assert.equal(s.rules.packetCost({type:'screenQueueAdd',propId:'screen',item:{provider:'javascript',id:'evil'}}),null);assert.equal(s.rules.packetCost({type:'ytChange',queue:Array(51).fill(0)}),null);assert(s.rules.packetCost({type:'screenQueueAdd',propId:'screen',item:{provider:'youtube',id:'dQw4w9WgXcQ',title:'A video'}})>0);
 const {c,request}=placements();c.attachYtVideo=()=>{};for(let i=0;i<5;i++)c.spawnPropMesh({id:'screen-'+i,type:'screen',x:0,z:0});assert(!c.validateRemotePropPlacement('peer',request('screen','sixth')).ok);
});
test('guard assets load before handlers and ship through both deploy paths',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');assert(html.indexOf('src="network-guard.js')<html.indexOf('src="ui.js'));for(const file of ['.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(require.resolve('../'+file),'utf8').includes('network-guard.js'));
});
