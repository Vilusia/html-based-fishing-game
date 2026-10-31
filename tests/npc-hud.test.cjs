const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync('ui.js','utf8');
function setup(){
 const c=vm.createContext({THREE,hudVisible:true,saveState:{showTitles:true},scene:new THREE.Scene(),isMobile:false,document:{body:{classList:{toggle(){}}},getElementById:()=>null},showToast(){}});
 let a=source.indexOf('function syncHudLabel('),b=source.indexOf('function updateSpriteDirection(',a);vm.runInContext(source.slice(a,b),c);
 a=source.lastIndexOf('function toggleHud()');b=source.indexOf('function update3DColorControls',a);vm.runInContext(source.slice(a,b),c);
 return c;
}
function npc(name){const g=new THREE.Group();g.name=name;for(const name of ['nameTag','npcIcon','titleSprite','talkingIcon']){const tag=new THREE.Group();tag.name=name;tag.position.y=3;tag.visible=name!=='talkingIcon';g.add(tag);}return g;}
test('HUD toggle hides every NPC name and logo without relying on an NPC registry',()=>{
 const c=setup(),all=['Merchant','Stylist','Captain Finn','Morrow','Inferno Guard','Custom NPC','Future NPC'].map(npc);all.forEach(n=>c.scene.add(n));c.toggleHud();
 for(const n of all){assert(n.visible);for(const label of n.children)assert.equal(label.visible,false,n.name+'/'+label.name);}
 c.toggleHud();for(const n of all){assert(n.getObjectByName('nameTag').visible);assert(n.getObjectByName('npcIcon').visible);assert(!n.getObjectByName('talkingIcon').visible,'inactive speech icon is not forced on');}
});
test('NPCs spawned while hidden stay hidden through label updates and restore with HUD',()=>{
 const c=setup();c.toggleHud();const spawned=npc('Late NPC');c.scene.add(spawned);c.syncCharacterOverhead(spawned);assert(!spawned.getObjectByName('nameTag').visible);assert(!spawned.getObjectByName('npcIcon').visible);c.toggleHud();assert(spawned.getObjectByName('nameTag').visible);assert(spawned.getObjectByName('npcIcon').visible);
});
test('hidden seasonal NPCs stay hidden and titles respect their own setting',()=>{
 const c=setup(),seasonal=npc('Morrow');seasonal.visible=false;c.scene.add(seasonal);c.toggleHud();c.saveState.showTitles=false;c.toggleHud();assert.equal(seasonal.visible,false);assert.equal(seasonal.getObjectByName('titleSprite').visible,false);
});
test('new icons are hidden immediately, before their first update frame',()=>{
 const c=setup();c.document.createElement=()=>({getContext:()=>({fillText(){}})});const a=source.indexOf('function addIcon('),b=source.indexOf('// --- DYNAMIC TEXTURE',a);vm.runInContext(source.slice(a,b),c);c.hudVisible=false;const owner=new THREE.Group();c.addIcon(owner,'$');assert.equal(owner.getObjectByName('npcIcon').visible,false);
});
test('new names follow hidden HUD at creation, in either character mode',()=>{
 const c=setup();c.hudVisible=false;c.makeCharacterBody=()=>new THREE.Group();c.createNameTagTexture=()=>{const t=new THREE.Texture();t.image={width:256};return t;};c.createTitleTexture=()=>null;c.createSpeakerTexture=()=>new THREE.Texture();c.makeRod=()=>new THREE.Group();
 const a=source.indexOf('function createPlayerMesh('),b=source.indexOf('function createLocalPlayer(',a);vm.runInContext(source.slice(a,b),c);const mesh=c.createPlayerMesh('#fff','New NPC');assert.equal(mesh.getObjectByName('nameTag').visible,false);
});
