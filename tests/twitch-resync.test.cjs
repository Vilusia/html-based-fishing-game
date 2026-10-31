const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('props.js','utf8');
test('page loads the updated props script rather than only updating outdoor-props',()=>{
 const html=fs.readFileSync('index.html','utf8'),pin=html.match(/src="props\.js\?v=([^"]+)"/);
 assert(pin,'exact props.js script is required');
 const version=pin[1].split('.').map(Number);
 assert(version[0]>12||version[0]===12&&(version[1]>478||version[1]===478),'props.js must invalidate the pre-resync 12.471 cache');
 assert(html.includes('id="screen-resync-live"'));
});
function setup(){
 let now=50000;const sent=[],house=[],mounts=[],applied=[],elements={};class Clock extends Date{static now(){return now;}}
 const entry={data:{id:'screen',provider:'twitch',twitchId:'channel',twitchKind:'channel',placer:'device',startedAt:100,queue:[{provider:'youtube',id:'M7lc1UVf-VE'}]},twitchUnmuted:true,houseSync:d=>house.push({...d})};
 const record={...entry.data,owner:'peer'};
 for(const id of ['screen-pause-button','screen-playback-status','screen-resync-live'])elements[id]={setAttribute(){}};
 const c=vm.createContext({window:{applyYtChange:m=>applied.push(m)},Date:Clock,myDeviceID:'device',isHost:false,hostConn:{open:true,send:m=>sent.push(m)},activeScreenId:'screen',myProps:[record],activeProps:[record],getScreenEntry:id=>id==='screen'?entry:null,resyncExistingTwitch:e=>mounts.push(e),broadcastToClients:m=>sent.push(m),showToast(){},document:{getElementById:id=>elements[id]},canPauseScreen:()=>false});
 vm.runInContext(source.slice(source.indexOf('function canResyncLiveScreen('),source.indexOf('function renderScreenQueue()')),c);
 return {c,entry,record,sent,house,mounts,applied,elements,advance:()=>now+=10001};
}
test('guest owner requests one authoritative room reload, preserving source and queue with cooldown',()=>{
 const s=setup();assert(s.c.window.resyncScreenToLive());assert.equal(s.sent.length,1);assert.equal(s.applied.length,0);assert.equal(s.sent[0].type,'ytChange');assert.equal(s.sent[0].twitchId,'channel');assert.equal(s.sent[0].queue,undefined);assert.equal(s.entry.data.queue.length,1);assert.equal(s.entry.twitchUnmuted,true);
 assert(!s.c.window.resyncScreenToLive());s.advance();assert(s.c.window.resyncScreenToLive());assert.equal(s.sent.length,2);
});
test('host owner reloads once, relays and updates late-join timestamp',()=>{
 const s=setup();s.c.isHost=true;assert(s.c.window.resyncScreenToLive());assert.equal(s.applied.length,1);assert.equal(s.sent.length,1);assert.equal(s.record.startedAt,50000);assert.equal(s.record.queue.length,1);
});
test('house owner catches up in the existing player locally and publishes the existing house stream snapshot',()=>{
 const s=setup();s.entry.isHouse=true;s.entry.houseOwnerLocal=true;assert(s.c.window.resyncScreenToLive());assert.equal(s.mounts.length,1);assert.equal(s.house.length,1);assert.equal(s.house[0].startedAt,50000);assert.equal(s.house[0].queue.length,1);assert.equal(s.sent.length,0);
});
test('visitors, non-owning hosts, VODs and disconnected users cannot trigger shared resync',()=>{
 for(const mode of ['visitor','host','house','vod','youtube','disconnected']){
  const s=setup();if(mode==='visitor'||mode==='host')s.c.myDeviceID='intruder';if(mode==='host')s.c.isHost=true;if(mode==='house'){s.entry.isHouse=true;s.entry.houseOwnerLocal=false;s.c.isHost=true;}if(mode==='vod')s.entry.data.twitchKind='video';if(mode==='youtube')s.entry.data.provider='youtube';if(mode==='disconnected')s.c.hostConn.open=false;
  assert(!s.c.window.resyncScreenToLive(),mode);assert.equal(s.sent.length+s.house.length+s.applied.length,0,mode);
 }
});
test('resync control appears only on live Twitch and explains buffering limits',()=>{
 const s=setup();s.c.renderScreenPauseControl(s.entry);assert.equal(s.elements['screen-resync-live'].hidden,false);assert.equal(s.elements['screen-resync-live'].disabled,false);assert.match(s.elements['screen-playback-status'].textContent,/buffering can differ/);
 s.c.myDeviceID='visitor';s.c.renderScreenPauseControl(s.entry);assert.equal(s.elements['screen-resync-live'].disabled,true);
 s.entry.data.twitchKind='video';s.c.renderScreenPauseControl(s.entry);assert.equal(s.elements['screen-resync-live'].hidden,true);
 assert(fs.readFileSync('index.html','utf8').includes('onclick="resyncScreenToLive()"'));
});
