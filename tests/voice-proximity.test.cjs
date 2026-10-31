const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync('ui.js','utf8');
function setup(){
 const audios={peer:null};const elements={};const c=vm.createContext({THREE,window:{Housing:{owner:'home'}},Housing:{owner:'home'},player:{position:new THREE.Vector3(0,0,0)},otherPlayers:{},localMutedVoice:[],saveState:{voiceVolume:1},MAX_VOICE_DISTANCE:10,document:{getElementById:id=>elements[id]||null}});
 const start=source.indexOf('function syncRemoteVoiceVolumes()'),end=source.indexOf('function updateVoiceVisuals()',start);vm.runInContext(source.slice(start,end),c);
 return {c,audios,elements,player:c.player,peer:pos=>{const audio={volume:1,muted:false,paused:false,plays:0,play(){this.plays++;this.paused=false;return Promise.resolve();}};elements['audio-peer']=audio;c.otherPlayers.peer={mesh:{position:new THREE.Vector3()},targetPos:new THREE.Vector3(...pos),lastData:{houseOwner:'home'},voiceId:'peer'};c.syncRemoteVoiceVolumes();return audio;}};
}
test('voice proximity follows live network target positions and can recover from zero volume',()=>{
 const s=setup();let audio=s.peer([20,0,0]);assert.equal(audio.volume,0);assert.equal(audio.muted,false);audio=s.peer([0,0,0]);assert(Math.abs(audio.volume-1)<1e-9);assert.equal(audio.paused,false);
 s.player.position.set(0,0,0);s.c.otherPlayers.peer.targetPos.set(2.5,0,0);s.c.syncRemoteVoiceVolumes();assert(Math.abs(audio.volume-.75)<1e-9);
});
test('mute and house isolation still silence proximity audio',()=>{
 const s=setup();const audio=s.peer([1,0,0]);s.c.otherPlayers.peer.lastData.isVoiceMuted=true;s.c.syncRemoteVoiceVolumes();assert(audio.muted);assert.equal(audio.volume,0);
 s.c.otherPlayers.peer.lastData.isVoiceMuted=false;s.c.otherPlayers.peer.lastData.houseOwner='other';s.c.syncRemoteVoiceVolumes();assert.equal(audio.muted,false);assert.equal(audio.volume,0);
});
test('voice volume is also refreshed by timers and incoming updates while the tab is hidden',()=>{
 assert(source.includes('setInterval(syncRemoteVoiceVolumes, 500)'));
 assert(source.includes("document.addEventListener('visibilitychange', () => {"));
 assert(source.includes('if (document.hidden) syncRemoteVoiceVolumes();'));
});
