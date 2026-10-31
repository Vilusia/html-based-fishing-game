const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const audio=fs.readFileSync(require.resolve('../audio.js'),'utf8'),ui=fs.readFileSync(require.resolve('../ui.js'),'utf8');
function setup(){
 const sources=[],panners=[],buffers=[];let resumes=0;
 const param=()=>({value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}}),node=()=>({connections:[],connect(n){this.connections.push(n);},disconnect(){},gain:param(),frequency:param(),Q:param()});
 const audioCtx={state:'running',currentTime:0,sampleRate:8000,resume(){resumes++;},createBuffer(ch,n){const data=new Float32Array(n),b={getChannelData:()=>data};buffers.push(b);return b;},createBufferSource(){const n=node();n.start=()=>{};n.stop=()=>{};sources.push(n);return n;},createGain:node,createPanner(){const n=node();for(const k of ['positionX','positionY','positionZ'])n[k]=param();panners.push(n);return n;}};
 const c=vm.createContext({audioCtx,window:{},player:{position:{x:0,y:0,z:0}},MAX_VOICE_DISTANCE:50,sfxGain:node(),midiGain:node(),Math,console});
 vm.runInContext(audio.slice(audio.indexOf('const createNoiseGain'),audio.indexOf('// --- CONTINUOUS SAIL AUDIO ---')),c);c.Sound=vm.runInContext('Sound',c);
 return {c,audioCtx,sources,panners,buffers,resumes:()=>resumes};
}
test('distant footsteps are culled before allocating audio or resuming the audio context',()=>{
 const s=setup();s.audioCtx.state='suspended';
 for(const pos of [{x:14,y:0,z:0},{x:500,y:0,z:0},{x:0,y:0,z:500},{x:0,y:100,z:0}])assert.equal(s.c.Sound.playSpatial('footstep',pos),false);
 assert.equal(s.buffers.length,0);assert.equal(s.sources.length,0);assert.equal(s.panners.length,0);assert.equal(s.resumes(),0);
 for(const pos of [null,{x:NaN,y:0,z:0},{x:0,y:Infinity,z:0}])assert.equal(s.c.Sound.playSpatial('footstep',pos),false);
});
test('nearby and local footsteps use the short panner range while other sounds retain their own ranges',()=>{
 const s=setup();s.c.Sound.playSpatial('footstep',{x:3,y:0,z:0});s.c.Sound.playSpatial('footstep',{x:0,y:0,z:0});assert.equal(s.sources.length,2);assert.equal(s.panners[0].maxDistance,14);assert.equal(s.panners[0].distanceModel,'linear');assert.equal(s.panners[0].positionX.value,3);
 assert.equal(s.c.worldSoundRange('swim'),18);assert.equal(s.c.worldSoundRange('sail'),26);assert.equal(s.c.worldSoundRange('talk'),50);
 s.c.player.position={x:1000,y:0,z:1000};assert.equal(s.c.Sound.playSpatial('footstep',{x:0,y:0,z:0}),false,'teleport updates distance immediately even with a stale Web Audio listener');s.c.Sound.playSpatial('footstep',{x:1002,y:0,z:1000});assert.equal(s.sources.length,3);
});
test('separate houses and outdoor/indoor spaces cannot leak positional sounds',()=>{
 const s=setup();s.c.window.Housing={presence:()=>({houseOwner:'house-a'})};
 for(const houseOwner of ['','house-b'])assert.equal(s.c.Sound.playSpatial('footstep',{x:1,y:0,z:0},0,{houseOwner}),false);
 s.c.Sound.playSpatial('footstep',{x:1,y:0,z:0},0,{houseOwner:'house-a'});assert.equal(s.sources.length,1);s.c.window.Housing.presence=()=>({houseOwner:''});assert.equal(s.c.Sound.playSpatial('footstep',{x:1,y:0,z:0},0,{houseOwner:'house-a'}),false);
});
test('host stamps tracked emitter position and identity while still relaying sound to other nearby listeners',()=>{
 const played=[],sent=[],guard={accept:()=>true},c=vm.createContext({window:{NetworkGuard:guard},NetworkGuard:guard,otherPlayers:{remote:{lastData:{pos:{x:300,y:0,z:200},houseOwner:'house-b'}}},Sound:{playSpatial(...a){played.push(a);return false;}},isHost:true,broadcastToClients:m=>sent.push(m)});
 vm.runInContext(ui.slice(ui.indexOf('function handleDataFromClient('),ui.indexOf('function handleDataFromHost(')),c);
 c.handleDataFromClient('remote',{type:'sound',name:'footstep',var:0,pos:{x:0,y:0,z:0},id:'forged',houseOwner:'house-a'});
 assert.equal(played.length,1);assert.equal(sent.length,1);assert.equal(sent[0].id,'remote');assert.equal(sent[0].pos.x,300);assert.equal(sent[0].houseOwner,'house-b');assert.equal(played[0][3].id,'remote');
});
test('clients skip the host echo of their own footsteps and preserve source context for remote sounds',()=>{
 const played=[],c=vm.createContext({window:{},myPeerId:'me',otherPlayers:{},localMutedMidi:[],Sound:{playSpatial(...a){played.push(a);}}});
 vm.runInContext(ui.slice(ui.indexOf('function handleDataFromHost('),ui.indexOf('function broadcastPlayerList(')),c);
 c.handleDataFromHost({type:'sound',id:'me',name:'footstep',pos:{x:0,y:0,z:0}});assert.equal(played.length,0);
 c.handleDataFromHost({type:'sound',id:'friend',name:'footstep',pos:{x:2,y:0,z:0},houseOwner:''});assert.equal(played.length,1);assert.equal(played[0][3].id,'friend');
});
