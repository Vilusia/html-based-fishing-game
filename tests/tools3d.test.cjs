const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'ui.js'),'utf8');
function setup(){const c=vm.createContext({THREE,window:{},saveState:{model3D:true,hotbar:[{type:'tool',id:'hands'}],activeHotbarIndex:0,activeToolIndex:0},player:new THREE.Group(),isGuitarActive:false,isGloveActive:false,localHeldFish:null,isHandsHidden:false});vm.runInContext(fs.readFileSync(path.join(root,'character3d.js'),'utf8'),c);c.Character3D=c.window.Character3D;c.makeRod=id=>{const r=new THREE.Group();r.name='rod';r.userData={is3D:true,rodId:id||'bamboo'};return r;};c.makeHeldFish=()=>{const f=new THREE.Group();f.name='heldFishSprite';f.userData={is3D:true,fishName:'Trout',size:1};return f;};c.disposeCharacterBody=()=>{};vm.runInContext(source.slice(source.indexOf('function equippedToolFromSave('),source.indexOf('function createRemotePlayer(')),c);return c;}
test('all held tools have real solid geometry and finite vertices',()=>{
 const c=setup();for(const type of ['axe','pickaxe','guitar','glove']){const tool=c.makeHeldTool(type,type);assert(tool.isGroup&&tool.userData.is3D);let solids=0;tool.traverse(obj=>{if(obj.geometry){solids++;assert([...obj.geometry.attributes.position.array].every(Number.isFinite));assert(obj.geometry.attributes.position.count>0);}});assert(solids>=3,type+' must have distinct modeled parts');}
});
test('first snapshot applies empty hands immediately and switching tools leaves only one visible',()=>{
 const c=setup(),owner=new THREE.Group();owner.add(c.makeRod('bamboo'));c.syncRemoteHeldItems(owner,{handsEmpty:false,tool:'hands'});assert.equal(owner.getObjectByName('rod').visible,false);
 for(const [data,name] of [[{tool:'axe'},'axeMesh'],[{tool:'pickaxe'},'pickaxeMesh'],[{guitar:true},'guitarMesh'],[{glove:true},'gloveMesh'],[{tool:'rod',rod:'oak'},'rod']]){c.syncRemoteHeldItems(owner,data);assert(owner.getObjectByName(name).visible);assert.equal(owner.children.filter(obj=>obj.visible).length,1);}
 c.syncRemoteHeldItems(owner,{handsEmpty:true,tool:'rod'});assert.equal(owner.children.filter(obj=>obj.visible).length,0);
});
test('sender uses hands hotbar slot even when the legacy index says rod',()=>{
 const c=setup();assert.equal(c.equippedToolFromSave(),'hands');c.saveState.hotbar[0]={type:'tool',id:'pickaxe'};assert.equal(c.equippedToolFromSave(),'pickaxe');c.isHandsHidden=true;assert.equal(c.equippedToolFromSave(),'hands');
});
test('cosmetic refresh keeps grip and sitting flags without rebuilding unchanged bodies',()=>{
 const c=setup(),group=new THREE.Group();let builds=0;c.makeCharacterBody=cfg=>{builds++;const body=new THREE.Group();body.name='playerSprite';body.userData={cfg,is3D:true};return body;};
 const a=source.indexOf('function replaceCharacterBody('),b=source.indexOf('\n}',a)+2;vm.runInContext(source.slice(a,b),c);
 const cfg={color:'#abcdef',holdingRod:true,sitting:true},body=c.replaceCharacterBody(group,cfg);c.replaceCharacterBody(group,{color:'#abcdef'});assert.equal(builds,1);assert.equal(group.getObjectByName('playerSprite'),body);assert.equal(body.userData.cfg.holdingRod,true);c.replaceCharacterBody(group,{color:'#abcdef',holdingRod:false});assert.equal(builds,2);
});

test('axe and pickaxe cutting profiles face forward and remain forward after a swing',()=>{
 const c=setup();for(const type of ['axe','pickaxe']){
  const tool=c.makeHeldTool(type,type);tool.updateMatrixWorld(true);
  const head=tool.getObjectByName(type==='axe'?'axeHead':'pickHead'),bounds=new THREE.Box3().setFromObject(head),size=bounds.getSize(new THREE.Vector3());
  assert(size.z>size.x*2,type+' head extends front-to-back rather than across the face');
  if(type==='axe'){const blade=tool.getObjectByName('blade'),tip=new THREE.Vector3();blade.getWorldPosition(tip);assert(tip.z>0,'axe cutting edge faces forward');}
  tool.rotation.y=-.5;tool.rotation.y=0;tool.updateMatrixWorld(true);const restored=new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());assert(restored.z>restored.x*2,'swing returns to the corrected profile');
 }
});
