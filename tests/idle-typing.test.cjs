const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('../vendor/three.min.js');const root=path.join(__dirname,'..'),ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');
function setup(cfg={}){const input={id:'chat-input',value:'private draft'},c=vm.createContext({THREE,window:{},document:{getElementById:()=>input,activeElement:null,hasFocus:()=>true},saveState:{model3D:true},replaceCharacterBody:(owner,cfg)=>{owner.getObjectByName('playerSprite').userData.cfg=cfg;return owner.getObjectByName('playerSprite');}});vm.runInContext(fs.readFileSync(path.join(root,'character3d.js'),'utf8'),c);const C=c.window.Character3D,t=()=>new THREE.Texture(),body=C.buildCharacter(cfg,{base:'#dca3ca',belly:'#fff',parts:'cat',pc:{}},{headFront:t(),headBack:t(),torsoFront:t(),torsoBack:t()});body.position.y=1.46875;const owner=new THREE.Group();owner.add(body);vm.runInContext(ui.slice(ui.indexOf('function sync3DRodGrip('),ui.indexOf('function updateSpriteDirection(')),c);return {c,C,owner,body,input};}
test('idle breathes through the upper body and cosmetics while feet remain planted',()=>{const {c,owner,body}=setup();for(let i=0;i<60;i++)c.updateStandingAnimation(owner,true,false,1/60);let moved=0;for(const batch of body.userData.poseBatches){const p=batch.geometry.attributes.position.array;for(let i=0;i<batch.standingRoles.length;i++)for(let axis=0;axis<3;axis++){const index=i*3+axis;if(batch.standingRoles[i]===-1)assert.equal(p[index],batch.rest[index]);else if(Math.abs(p[index]-batch.rest[index])>.001)moved++;}assert([...p].every(Number.isFinite));}assert(moved>100);assert(body.userData.drawCalls<=3);assert.equal(body.position.y,1.46875);});
test('rod, fish and each held tool follow the idle gripping hand without repeated model builds',()=>{
 for(const [name,type] of [['rod','rod'],['heldFishSprite','fish'],['axe','axe'],['pickaxe','pickaxe'],['guitarMesh','guitar'],['gloveMesh','glove']]){
  const {c,owner,body}=setup(),item=new THREE.Group();item.name=name;item.userData={is3D:true,toolType:type};owner.add(item);
  c.sync3DRodGrip(owner);for(let i=0;i<45;i++)c.updateStandingAnimation(owner,true,false,1/60);
  body.updateMatrix();const guitar=type==='guitar',fish=type==='fish',expected=new THREE.Vector3(guitar?.3:.56,(fish?-.45:guitar?-.42:-.62)+body.userData.upperLift,fish?.5:guitar?.5:.43).applyMatrix4(body.userData.standingTransform).applyMatrix4(body.matrix);
  assert(item.position.distanceTo(expected)<1e-6,name+' must follow the grip');assert.equal(owner.getObjectByName('playerSprite'),body);
 }
});
test('typing brings the free hand to the chin while keeping the rod hand in its held pose',()=>{const {c,owner,body}=setup({holdingRod:true}),rod=new THREE.Group();rod.name='rod';rod.userData.is3D=true;owner.add(rod);for(let i=0;i<30;i++)c.updateStandingAnimation(owner,true,true,1/60);assert.equal(owner.userData.standingAnimation.thinking,1);const inverse=new THREE.Matrix4().copy(body.userData.standingTransform).invert();let left=0,right=0;for(const batch of body.userData.poseBatches){const p=batch.geometry.attributes.position;for(let index=0;index<batch.standingRoles.length;index++){const role=batch.standingRoles[index],v=new THREE.Vector3().fromBufferAttribute(p,index).applyMatrix4(inverse);if(role===2&&v.y>body.userData.upperLift-.35&&v.z>.4)left++;if(role===4){assert(Math.abs(v.y-batch.rest[index*3+1])<1e-6);right++;}}}assert(left>0&&right>0);});
test('movement and higher-priority poses cleanly stop the idle/thinking geometry',()=>{const {c,owner,body}=setup();for(let i=0;i<30;i++)c.updateStandingAnimation(owner,true,true,1/60);for(let i=0;i<30;i++)c.updateStandingAnimation(owner,false,false,1/60);for(const batch of body.userData.poseBatches)for(let i=0;i<batch.rest.length;i++)assert(Math.abs(batch.geometry.attributes.position.array[i]-batch.rest[i])<1e-6);assert.equal(owner.userData.standingIdle,false);c.updateStandingAnimation(owner,true,true,.1);c.updateStandingAnimation(owner,true,true,.1,true);assert.equal(owner.userData.standingAnimation.thinking,0);assert(body.userData.standingTransform.equals(new THREE.Matrix4()));owner.userData.emoting=true;c.updateStandingAnimation(owner,true,true,.1);assert.equal(owner.userData.standingIdle,false);});
test('typing detects chat focus only, ends on blur, and syncs a boolean rather than the draft',()=>{const {c,input}=setup();assert.equal(c.chatTypingActive(),false);c.document.activeElement=input;assert.equal(c.chatTypingActive(),true);c.document.hasFocus=()=>false;assert.equal(c.chatTypingActive(),false);c.document.hasFocus=()=>true;c.document.activeElement={id:'shop-search'};assert.equal(c.chatTypingActive(),false);assert(ui.includes('myData.typing = chatTypingActive()'));assert(ui.includes('myData.idle = !!player.userData.standingIdle'));assert(ui.includes("p.lastData?.typing===true&&Date.now()-p.lastSeen<3000"));assert(!ui.includes('myData.typing = ci.value'));});
test('retained 2D idle and composing pose return to neutral when chat closes and movement starts',()=>{const {c,owner,body}=setup();body.userData.is3D=false;for(let i=0;i<30;i++)c.updateStandingAnimation(owner,true,true,1/60);assert(body.rotation.z>.04);for(let i=0;i<30;i++)c.updateStandingAnimation(owner,false,false,1/60);assert.equal(body.rotation.z,0);});

test('seated breathing and occasional hand shifts keep feet fixed without accumulating drift',()=>{
 const {C,body}=setup({sitting:true,holdingRod:true});
 C.animateStanding(body,4,1,0);
 let torso=0,hand=0;
 const snapshot=body.userData.poseBatches.map(batch=>batch.geometry.attributes.position.array.slice());
 for(const batch of body.userData.poseBatches){
  const p=batch.geometry.attributes.position.array;
  for(let i=0;i<batch.standingRoles.length;i++){
   const role=batch.standingRoles[i];
   for(let a=0;a<3;a++){
    const k=i*3+a;
    if(role===-1||role>=3)assert.equal(p[k],batch.rest[k],'feet and occupied hand remain at rest');
    else if(Math.abs(p[k]-batch.rest[k])>.001){if(role===0)torso++;else hand++;}
   }
  }
 }
 assert(torso>0&&hand>0);
 for(let i=0;i<600;i++)C.animateStanding(body,i/60,1,0);
 C.animateStanding(body,4,1,0);
 body.userData.poseBatches.forEach((batch,i)=>assert.deepEqual(batch.geometry.attributes.position.array,snapshot[i]));
 C.animateStanding(body,0,0,0);
 for(const batch of body.userData.poseBatches)assert.deepEqual(batch.geometry.attributes.position.array,batch.rest);
});

test('shared sitting update produces visible breathing and hand travel across rendered frames',()=>{
 const {c,owner,body}=setup({sitting:true});
 vm.runInContext(ui.slice(ui.indexOf('function applySittingPose('),ui.indexOf('function bellySlideDirection(')),c);
 owner.userData.seatedIdle={time:0};
 const ranges=new Map();
 for(let frame=0;frame<360;frame++){
  c.updateStandingAnimation(owner,true,false,1/60,true);
  c.applySittingPose(owner,true,1/60);
  c.updateJumpAnimation(owner,false,0,1/60,true);
  body.userData.poseBatches.forEach((batch,b)=>{
   const p=batch.geometry.attributes.position.array;
   for(let i=0;i<batch.standingRoles.length;i++){
    if(batch.standingRoles[i]!==0&&batch.standingRoles[i]!==2)continue;
    const key=b+':'+i,entry=ranges.get(key)||{role:batch.standingRoles[i],min:Infinity,max:-Infinity};
    entry.min=Math.min(entry.min,p[i*3+1]);entry.max=Math.max(entry.max,p[i*3+1]);ranges.set(key,entry);
   }
  });
 }
 assert([...ranges.values()].some(r=>r.role===0&&r.max-r.min>.08),'upper body must visibly breathe');
 assert([...ranges.values()].some(r=>r.role===2&&r.max-r.min>.08),'free hand must visibly shift');
 assert.equal(owner.getObjectByName('playerSprite'),body,'animation must not rebuild the model');
});
