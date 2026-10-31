const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
function setup(){
    let now=1000,blips=0;
    const mesh=x=>{const icon={visible:false},sprite={userData:{is3D:true,mouth:{scale:{y:.025}}}};return {userData:{},position:new THREE.Vector3(x,0,0),getObjectByName:id=>id==='talkingIcon'?icon:id==='playerSprite'?sprite:null};};
    const player=mesh(0),remote=mesh(3),audio={volume:1,muted:false};
    const analyser=value=>({getByteFrequencyData:data=>data.fill(value)});
    const context=vm.createContext({window:{},performance:{now:()=>now},Math,Uint8Array,player,otherPlayers:{remote:{mesh:remote,lastData:{houseOwner:''}}},voiceAnalysers:{local:analyser(50),remote:analyser(55)},isMicMuted:false,localMutedVoice:[],MAX_VOICE_DISTANCE:50,saveState:{voiceVolume:1},hudVisible:true,document:{getElementById:()=>audio},Sound:{playSpatial(){blips++;}}});
    vm.runInContext(source.slice(source.indexOf('function setVoiceActivity('),source.indexOf('// --- GAME INITIALIZATION & LOBBY ---')),context);
    vm.runInContext(source.slice(source.indexOf('function hashString('),source.indexOf('function setupInputs()',source.indexOf('function updateTalkingPlayers('))),context);
    return {context,player,remote,audio,time:value=>{now=value;},blips:()=>blips};
}
test('local microphone and received voice animate mouths without extra chat sounds, and mute closes them',()=>{
    const {context:c,player,remote,audio,blips}=setup();c.updateVoiceVisuals();c.updateTalkingPlayers(1000);
    assert(player.userData.talking&&player.userData.talkMouthOpen);assert(remote.userData.talking&&remote.userData.talkMouthOpen);assert.equal(blips(),0);
    c.updateSpriteDirection(player,{});assert(player.getObjectByName('playerSprite').userData.mouth.scale.y>.025);
    c.isMicMuted=true;c.localMutedVoice=['remote'];c.updateVoiceVisuals();c.updateTalkingPlayers(1000);c.updateSpriteDirection(player,{});
    assert.equal(player.userData.talking,false);assert.equal(remote.userData.talking,false);assert.equal(audio.muted,true);assert.equal(player.getObjectByName('playerSprite').userData.mouth.scale.y,.025);
});
test('house isolation, range and stale audio cannot leave a mouth stuck open; typed chat still animates',()=>{
    const {context:c,player,remote,time,blips}=setup();c.otherPlayers.remote.lastData.houseOwner='other-house';c.updateVoiceVisuals();c.updateTalkingPlayers(1000);assert(!remote.userData.talking);
    c.otherPlayers.remote.lastData.houseOwner='';remote.position.x=100;c.updateVoiceVisuals();c.updateTalkingPlayers(1000);assert(!remote.userData.talking);
    time(1300);c.updateTalkingPlayers(1300);assert(!player.userData.talking,'missing audio updates expire');
    c.isMicMuted=true;c.updateVoiceVisuals();c.startPlayerTalking(player,'Hello fish!','local');c.updateTalkingPlayers(1300);assert(player.userData.talking&&player.userData.talkMouthOpen);assert.equal(blips(),1);
    time(10000);c.updateTalkingPlayers(10000);assert(!player.userData.talking);
});
test('2D characters use the same open-mouth texture for mic speech',()=>{
    const {context:c,player}=setup();const front={},back={},open={},sprite=player.getObjectByName('playerSprite');sprite.userData={matFront:front,matBack:back};
    c._optVec1=new THREE.Vector3();c._optVec2=new THREE.Vector3();player.getWorldDirection=out=>out.set(0,0,1);c.ensureOpenMouthMaterial=()=>open;
    c.updateVoiceVisuals();c.updateTalkingPlayers(1000);c.updateSpriteDirection(player,new THREE.Vector3(0,0,3));assert.equal(sprite.material,open);
    c.isMicMuted=true;c.updateVoiceVisuals();c.updateTalkingPlayers(1000);c.updateSpriteDirection(player,new THREE.Vector3(0,0,3));assert.equal(sprite.material,front);
});
test('voice cycles five distinct 3D mouth shapes and silence restores a neutral mouth',()=>{
    const {context:c,player,time}=setup(),shapes=new Set();
    for(let i=0;i<10;i++){const now=1000+i*110;time(now);c.setVoiceActivity(player,50,true);c.updateTalkingPlayers(now);player.userData.talkMouthOpen=true;c.updateSpriteDirection(player,{});const mouth=player.getObjectByName('playerSprite').userData.mouth;shapes.add(player.userData.mouthShape);assert(mouth.scale.x>0);}
    assert.equal(shapes.size,5);c.setVoiceActivity(player,0,false);c.updateTalkingPlayers(2200);c.updateSpriteDirection(player,{});assert.equal(player.getObjectByName('playerSprite').userData.mouth.scale.y,.025);
});
test('five 2D talking textures are lazy cached and use distinct drawn mouth proportions',()=>{
    const {context:c}=setup();c.THREE=THREE;let textures=0;const names=[];
    c.characterLookFromCfg=()=>({parts:{},base:'#fff',belly:'#fff',pc:{}});c.createSpeciesTexture=(...args)=>{textures++;names.push(args[11]);return new THREE.Texture();};
    vm.runInContext(source.slice(source.indexOf('function ensureOpenMouthMaterial('),source.indexOf('// Tear down a body mesh/group',source.indexOf('function ensureOpenMouthMaterial('))),c);
    const sprite={userData:{cfg:{}}},materials=[];for(let i=0;i<5;i++){const material=c.ensureOpenMouthMaterial(sprite,i);materials.push(material);assert.equal(c.ensureOpenMouthMaterial(sprite,i),material);}
    assert.equal(textures,5);assert.equal(new Set(materials).size,5);assert.equal(new Set(names).size,5);
    vm.runInContext(source.slice(source.indexOf('function drawTalkingMouth('),source.indexOf('// Main drawing function',source.indexOf('function drawTalkingMouth('))),c);
    const proportions=new Set();for(const name of names){const ellipses=[],ctx={save(){},restore(){},beginPath(){},ellipse(...args){ellipses.push(args);},fill(){},stroke(){},clip(){},fillRect(){}};c.drawTalkingMouth(ctx,name);proportions.add(ellipses[0][2]+':'+ellipses[0][3]);}assert.equal(proportions.size,5);
});
