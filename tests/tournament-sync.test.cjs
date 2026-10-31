const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../tournaments.js'),'utf8'),HOUR=3600000;
function room(){
 let now=3500000,serial=0,friend,host,dropAwards=0,dropAcks=0,throwObserver=false,saveOK=true,lastSaved=null;
 const packets=[],requests=[];
 function peer(id,isHost,saved){
  let tick,saves=0;class Clock extends Date{static now(){return now;}}
  const el=()=>({style:{},children:[],textContent:'',append(...v){this.children.push(...v);},replaceChildren(){this.children=[];}}),nodes=Object.fromEntries(['tournament-status','tournament-standings','tournament-winners'].map(id=>[id,el()]));nodes['lobby-screen']={style:{display:'none'}};
  const conns=isHost?{friend:{open:true,send(msg){packets.push(structuredClone(msg));if(msg.award&&dropAwards-->0)return;friend?.api.host(structuredClone(msg));}},observer:{open:true,send(){if(throwObserver)throw Error('connection failed');}}}:{};
  const context=vm.createContext({window:{},Date:Clock,console:{warn(){}},document:{body:el(),createElement:el,getElementById:id=>nodes[id]},setInterval:fn=>tick=fn,crypto:{randomUUID:()=> 'cast-'+(++serial)},myPeerId:id,currentRoomId:'test-room',isHost,hostConn:isHost?null:{open:true,send(msg){requests.push(structuredClone(msg));if(msg.type==='tournament:ack'&&dropAcks-->0)return;host.api.client(id,msg);}},clientConns:conns,otherPlayers:{friend:{lastData:{name:'Friend'}},observer:{lastData:{name:'Observer'}}},player:{},FISH_TYPES:[{name:'Trout'}],RAIN_FISH:[],VOID_FISH:[],LAVA_FISH:[],saveState:saved||{money:0,displayName:id,tournamentAwards:[]},saveGame(){saves++;if(!isHost&&saveOK)lastSaved=structuredClone(context.saveState);return isHost||saveOK;},showToast(){},displayChatMessage(){}});
  vm.runInContext(source,context);return {context,api:context.window.Tournaments,tick:()=>tick(),nodes,saves:()=>saves};
 }
 host=peer('host',true);friend=peer('friend',false);host.tick();friend.tick();
 function catchFor(id,token){host.api.client(id,{type:'tournament:cast',hour:Math.floor(now/HOUR),token});now+=3000;host.api.client(id,{type:'tournament:catch',hour:Math.floor(now/HOUR),token,fish:'Trout'});}
 function standings(){host.api.cast();now+=3000;host.api.caught({name:'Trout'});catchFor('friend','friend-one');catchFor('friend','friend-two');catchFor('observer','observer-one');host.tick();}
 return {host,get friend(){return friend;},packets,requests,standings,catchFor,at:v=>now=v,advance:v=>now+=v,dropAwards:v=>dropAwards=v,dropAcks:v=>dropAcks=v,throwObserver:v=>throwObserver=v,saveOK:v=>saveOK=v,reload(){friend=peer('friend',false,lastSaved);return friend;}};
}
test('guest recovers rollover and podium payout when the host interval has not run',()=>{
 const r=room();r.standings();assert.match(r.friend.nodes['tournament-status'].textContent,/Reward so far: \$5,010/);
 r.at(HOUR+100);r.friend.tick();assert(r.requests.some(v=>v.type==='tournament:sync'));assert.equal(r.friend.context.saveState.money,5010);assert.match(r.friend.nodes['tournament-status'].textContent,/Time left: 60:00/);
 assert(r.friend.nodes['tournament-winners'].textContent.includes('Friend'));r.host.tick();assert.equal(r.friend.context.saveState.money,5010);assert(!r.packets.at(-1).award);
});
test('dropped result retries the same payout until acknowledged, with no double credit',()=>{
 const r=room();r.standings();r.dropAwards(1);r.at(HOUR);r.host.tick();assert.equal(r.friend.context.saveState.money,0);const lost=r.packets.at(-1).award;assert(lost);
 r.dropAcks(1);r.advance(1000);r.host.tick();assert.equal(r.friend.context.saveState.money,5010);assert.equal(r.packets.at(-1).award.id,lost.id);
 r.advance(1000);r.host.tick();assert.equal(r.friend.context.saveState.money,5010);assert.equal(r.packets.at(-1).award.id,lost.id);r.host.tick();assert(!r.packets.at(-1).award);
});
test('reloading restores prize receipts and acknowledges an already-paid retry without paying twice',()=>{
 const r=room();r.standings();r.dropAcks(1);r.at(HOUR);r.host.tick();assert.equal(r.friend.context.saveState.money,5010);assert.equal(r.friend.context.saveState.tournamentAwards.length,1);
 r.reload();r.host.tick();assert.equal(r.friend.context.saveState.money,5010);assert.equal(r.friend.context.saveState.tournamentAwards.length,1);r.host.tick();assert(!r.packets.at(-1).award);
 const ui=fs.readFileSync(require.resolve('../ui.js'),'utf8');assert(ui.includes('saveState.tournamentAwards=Array.isArray(d.tournamentAwards)'));
});
test('failed save keeps prize pending, and one broken connection does not interrupt other recipients',()=>{
 const r=room();r.standings();r.saveOK(false);r.throwObserver(true);r.at(HOUR);assert.doesNotThrow(()=>r.host.tick());assert.equal(r.friend.context.saveState.money,5010);assert(!r.requests.some(v=>v.type==='tournament:ack'));
 r.host.tick();assert(r.packets.at(-1).award);assert.equal(r.friend.context.saveState.money,5010);r.saveOK(true);r.host.tick();assert(r.requests.some(v=>v.type==='tournament:ack'));r.host.tick();assert(!r.packets.at(-1).award);
});
test('older snapshots cannot rewind a recovered timer and forged acknowledgments cannot clear another player award',()=>{
 const r=room();r.standings();const old=structuredClone(r.packets.at(-1));r.dropAwards(2);r.at(HOUR);r.host.tick();const award=r.packets.at(-1).award;
 r.host.api.client('observer',{type:'tournament:ack',awardId:award.id});r.host.api.client('friend',{type:'tournament:ack',awardId:'fake'});r.host.tick();assert.equal(r.packets.at(-1).award.id,award.id);
 r.host.tick();assert.equal(r.friend.context.saveState.money,5010);r.friend.api.host(old);assert.match(r.friend.nodes['tournament-status'].textContent,/Your catches: 0/);
});
test('expired timer shows finalizing state while awaiting the host, and sync requests are throttled',()=>{
 const r=room();r.standings();r.friend.context.hostConn.send=msg=>r.requests.push(msg);r.at(HOUR);r.friend.tick();assert.match(r.friend.nodes['tournament-status'].textContent,/Finalizing results/);
 const n=r.requests.length;r.friend.tick();assert.equal(r.requests.length,n);r.advance(2000);r.friend.tick();assert.equal(r.requests.length,n+1);
});
test('actual game save reports storage failure and saves prize receipts alongside money',()=>{
 const ui=fs.readFileSync(require.resolve('../ui.js'),'utf8'),start=ui.indexOf('function saveGame()'),end=ui.indexOf('function updateWeatherVisuals()',start);let fail=true,saved;
 const context=vm.createContext({console:{warn(){}},document:{getElementById:id=>id==='username-input'?{value:'Friend'}:null},saveState:{money:5010,tournamentAwards:['test-room:0:friend']},myData:{},updateUI(){},updateLocalVisuals(){},updateHotbarVisuals(){},localStorage:{setItem(key,value){if(fail)throw Error('storage unavailable');saved={key,value};}}});
 vm.runInContext(ui.slice(start,end),context);assert.equal(context.saveGame(),false);assert.equal(saved,undefined);fail=false;assert.equal(context.saveGame(),true);
 assert.equal(saved.key,'islandFisherSave');assert.equal(JSON.parse(saved.value).money,5010);assert.deepEqual(JSON.parse(saved.value).tournamentAwards,['test-room:0:friend']);
});
test('unacknowledged prizes retain their original round ids when another round settles',()=>{
 const c=vm.createContext({window:{}});vm.runInContext(source,c);let now=10000;const t=new c.window.TournamentRules.Tournament(()=>now,()=>true);
 function catchOne(token){t.receive('friend','Friend',{type:'tournament:cast',hour:t.hour,token});now+=3000;t.receive('friend','Friend',{type:'tournament:catch',hour:t.hour,token,fish:'Trout'});}
 catchOne('one');now=HOUR;t.tick();catchOne('two');now=HOUR*2;t.tick();assert.equal(t.pending.get('friend'),10);assert.equal(t.awards.get('friend')[0].hour,0);assert.equal(t.awards.get('friend')[1].hour,1);
 assert(!t.acknowledge('other',0));assert(t.acknowledge('friend',0));assert.equal(t.pending.get('friend'),5);assert.equal(t.awards.get('friend')[0].hour,1);assert(!t.acknowledge('friend',0));assert(t.acknowledge('friend',1));assert(!t.pending.has('friend'));
});
