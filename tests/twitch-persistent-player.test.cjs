const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('props.js','utf8');
function setup(){
 const calls=[],controllers=[];
 class Player{
  static READY='ready';static PLAYBACK_BLOCKED='blocked';
  constructor(id,options){this.id=id;this.options=options;this.events={};this.paused=false;controllers.push(this);}
  addEventListener(event,fn){this.events[event]=fn;}
  isPaused(){return this.paused;}pause(){this.paused=true;calls.push('pause');}play(){this.paused=false;calls.push('play');}setChannel(ch){calls.push(['channel',ch]);}setMuted(m){calls.push(['mute',m]);}destroy(){calls.push('destroy');}
 }
 const iframe={identity:'original iframe'},wrap={isConnected:true,appendChild(){}},entry={provider:'twitch',data:{id:'screen',provider:'twitch',twitchId:'testchannel',twitchKind:'channel',startedAt:1,queue:[]},twVideoWrap:wrap,twFrame:{style:{}},twitchUnmuted:true,mesh:{}};
 const c=vm.createContext({window:{Twitch:{Player}},Promise,Date,console,activeScreenId:'screen',getScreenEntry:()=>entry,showToast(){},addSoundChip:(frame,e)=>e.soundChip={test:true},document:{createElement:()=>({style:{},querySelector:()=>iframe})},ytPlayers:{screen:entry},twitchParents:()=>['localhost'],twitchListenerDistance:()=>2,TWITCH_AUDIO_OUT:30,screenSourceFromData:d=>d&&({provider:d.provider,id:d.twitchId,twitchKind:d.twitchKind}),buildTwitchIframe(){throw Error('unexpected iframe rebuild');}});
 vm.runInContext(source.slice(source.indexOf('let twitchControlApi ='),source.indexOf('// Shared iframe construction')),c);
 return {c,calls,controllers,entry,iframe};
}
test('official API mounts one player and same-channel resync keeps that player and iframe',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();await Promise.resolve();assert.equal(s.controllers.length,1);
 const control=s.controllers[0];assert.equal(control.options.channel,'testchannel');assert.equal(control.options.muted,false);control.events.ready();assert.equal(s.entry.iframe,s.iframe);
 assert(s.c.resyncExistingTwitch(s.entry));assert(s.c.resyncExistingTwitch(s.entry));
 assert.equal(s.controllers.length,1);assert.equal(s.entry.iframe,s.iframe);assert.equal(s.calls.filter(x=>x==='destroy').length,0);assert.equal(s.calls.filter(x=>x==='play').length,0);assert.equal(s.calls.filter(x=>x==='pause').length,0);assert(!s.calls.some(x=>Array.isArray(x)&&x[0]==='channel'));
});
test('room relay for the same live channel catches up without mountScreenContent or losing queue',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();s.controllers[0].events.ready();
 s.c.activeScreenId=null;s.c.myProps=[];s.c.activeProps=[];s.c.props={};s.c.mountScreenContent=()=>{throw Error('same-channel relay rebuilt the screen');};
 vm.runInContext(source.slice(source.indexOf('window.applyYtChange ='),source.indexOf('// --- STREAM QUEUE')),s.c);
 const queue=s.entry.data.queue;queue.push({provider:'youtube',id:'M7lc1UVf-VE'});
 s.c.window.applyYtChange({type:'ytChange',propId:'screen',provider:'twitch',twitchId:'testchannel',twitchKind:'channel',startedAt:20});
 assert.equal(s.entry.iframe,s.iframe);assert.equal(s.entry.data.queue.length,1);assert.equal(s.entry.data.startedAt,20);assert(!s.calls.includes('play'));assert(!s.calls.includes('pause'));
});
test('house viewer updates preserve player; queue-only changes never interrupt playback',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();s.controllers[0].events.ready();
 assert(s.c.window.updateHouseLiveStream('screen',{provider:'twitch',twitchId:'testchannel',twitchKind:'channel',startedAt:2,queue:[]}));assert.equal(s.entry.iframe,s.iframe);const count=s.calls.length;
 assert(s.c.window.updateHouseLiveStream('screen',{provider:'twitch',twitchId:'testchannel',twitchKind:'channel',startedAt:2,queue:[{id:'next'}]}));assert.equal(s.calls.length,count);assert.equal(s.entry.data.queue.length,1);
 assert(!s.c.window.updateHouseLiveStream('screen',{provider:'twitch',twitchId:'anotherchannel',twitchKind:'channel'}));
 const housing=fs.readFileSync('housing.js','utf8');assert(housing.indexOf('window.updateHouseLiveStream?.')<housing.indexOf('removeScreen(item.id);mesh.userData.screenKey=screenKey;'));
});
test('resync during loading waits for readiness, and stale async mounts never recreate deleted screens',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);assert.equal(s.c.resyncExistingTwitch(s.entry),false);await Promise.resolve();s.controllers[0].paused=true;s.controllers[0].events.ready();assert(s.calls.includes('play'));
 const stale=setup();stale.c.mountTwitch(stale.entry);stale.c.destroyTwitchControl(stale.entry);await Promise.resolve();assert.equal(stale.controllers.length,0);
});
test('sound opt-in and distance changes use controls rather than replacing the iframe',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();s.controllers[0].events.ready();
 let a=source.indexOf('function swapTwitchIframe('),b=source.indexOf('// Where the listener',a);vm.runInContext(source.slice(a,b),s.c);
 s.entry.twitchAudioOn=false;s.c.swapTwitchIframe(s.entry);assert.deepEqual(s.calls.at(-1),['mute',true]);
 a=source.indexOf('function unmuteTwitch(');b=source.indexOf('// Mount a deferred Twitch player',a);vm.runInContext(source.slice(a,b),s.c);
 s.entry.twitchUnmuted=false;s.c.unmuteTwitch(s.entry);assert.equal(s.calls.at(-1),'play');assert.equal(s.entry.iframe,s.iframe);assert.equal(s.controllers.length,1);
});
test('room recovery resumes only paused players and never pauses or changes a channel',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();const p=s.controllers[0];p.events.ready();
 p.paused=true;assert(s.c.resyncExistingTwitch(s.entry));assert.equal(p.paused,false);assert.equal(s.calls.filter(x=>x==='play').length,1);
 assert(s.c.resyncExistingTwitch(s.entry));assert.equal(s.calls.filter(x=>x==='play').length,1);
 assert(!s.calls.includes('pause'));assert(!s.calls.some(x=>Array.isArray(x)&&x[0]==='channel'));assert.equal(s.entry.iframe,s.iframe);
});
test('Play here runs locally without waiting for a host or modifying other viewers',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();s.controllers[0].events.ready();s.controllers[0].paused=true;
 assert(s.c.window.playTwitchHere());assert.equal(s.controllers[0].paused,false);assert.equal(s.calls.at(-1),'play');assert.equal(s.entry.iframe,s.iframe);
});
test('missing status controls never trigger a disruptive fallback reset',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();s.controllers[0].events.ready();s.controllers[0].isPaused=undefined;
 assert(s.c.resyncExistingTwitch(s.entry));assert(!s.calls.includes('pause'));assert(!s.calls.includes('play'));assert(!s.calls.some(x=>Array.isArray(x)&&x[0]==='channel'));
});
test('explicit local restart discards the old player and opens a fresh live channel without shared changes',async()=>{
 const s=setup();s.c.mountTwitch(s.entry);await Promise.resolve();s.controllers[0].events.ready();const queue=s.entry.data.queue,startedAt=s.entry.data.startedAt;
 s.c.mountScreenContent=entry=>{s.c.destroyTwitchControl(entry);s.c.mountTwitch(entry);};
 assert(s.c.window.restartTwitchAtLive());await Promise.resolve();
 assert.equal(s.controllers.length,2);assert(s.calls.includes('destroy'));
 const fresh=s.controllers[1];assert.equal(fresh.options.channel,'testchannel');assert.equal(fresh.options.video,undefined);assert.equal(fresh.options.time,undefined);assert.equal(fresh.options.autoplay,true);
 fresh.events.ready();assert.equal(s.calls.at(-1),'play');assert.equal(s.entry.data.queue,queue);assert.equal(s.entry.data.startedAt,startedAt);
 assert(!s.c.window.restartTwitchAtLive(),'cooldown prevents repeated frame replacement');assert.equal(s.controllers.length,2);
});
test('restart blocked by sound autoplay retries muted once and offers the sound chip',async()=>{
 const s=setup();s.entry.restartLiveRequested=true;s.c.mountTwitch(s.entry);await Promise.resolve();const p=s.controllers[0];p.events.ready();
 p.events.blocked();assert.deepEqual(s.calls.at(-2),['mute',true]);assert.equal(s.calls.at(-1),'play');assert.equal(s.entry.twitchUnmuted,false);assert(s.entry.soundChip);
 const count=s.calls.length;p.events.blocked();assert.equal(s.calls.length,count,'no autoplay retry loop');
});
test('restart does not affect recordings or non-Twitch screens',()=>{
 for(const [provider,kind]of [['twitch','video'],['youtube',null]]){const s=setup();s.entry.provider=provider;s.entry.data.twitchKind=kind;assert(!s.c.window.restartTwitchAtLive());assert.equal(s.controllers.length,0);}
});
