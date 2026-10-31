const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),THREE=require('../vendor/three.min.js');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'ui.js'),'utf8');
function setup(solid=true){
 const c=vm.createContext({THREE,window:{},ROD_CAST_2D:1.05,ROD_IDLE_2D:-.2});vm.runInContext(fs.readFileSync(path.join(root,'character3d.js'),'utf8'),c);
 const texture=()=>new THREE.Texture(),body=c.window.Character3D.buildCharacter({holdingRod:true},{base:'#aaa',belly:'#fff',parts:'cat',pc:{}},{headFront:texture(),headBack:texture(),torsoFront:texture(),torsoBack:texture()});
 const owner=new THREE.Group(),rod=c.window.Character3D.buildRod({id:'bamboo'});body.position.y=1.46875;owner.add(body,rod);rod.position.set(.56,.84875,.43);rod.rotation.x=1.05;
 if(!solid){body.userData.is3D=false;rod.userData.is3D=false;}
 vm.runInContext(source.slice(source.indexOf('function rodAngleFor('),source.indexOf('// A billboard fishing rod')),c);
 vm.runInContext(source.slice(source.indexOf('function updateReelingAnimation('),source.indexOf('function updateSpriteDirection(')),c);
 return {c,body,rod,owner};
}
test('reeling moves both hands and crank without rebuilding and restores exact arm rest positions',()=>{
 const {c,owner,body,rod}=setup(),batch=body.userData.walkBatches[0],before=batch.geometry.attributes.position.array.slice();
 for(let i=0;i<30;i++)c.updateReelingAnimation(owner,true,1/60);
 const p=batch.geometry.attributes.position.array;assert([...p].every(Number.isFinite));
 for(const side of [-1,1])assert(batch.emoteVertices.filter(v=>v.side===side).some(v=>p[v.index*3+1]!==before[v.index*3+1]));
 assert(rod.getObjectByName('reelCrankPivot').rotation.x>0);
 const leg=batch.vertices[0].index*3;assert.equal(p[leg],before[leg]);assert.equal(p[leg+1],before[leg+1]);
 for(let i=0;i<30;i++)c.updateReelingAnimation(owner,false,1/60);
 for(const v of batch.emoteVertices)for(let k=0;k<3;k++)assert.equal(p[v.index*3+k],before[v.index*3+k]);
 assert.equal(rod.rotation.x,.3);assert.equal(owner.userData.reelAnimation.weight,0);
});
test('remote state, hidden rods and emotes gate reeling; legacy 2D rod also animates and resets',()=>{
 const {c,owner,rod,body}=setup();rod.visible=false;c.updateReelingAnimation(owner,true,.1);assert.equal(owner.userData.reelAnimation.weight,0);
 rod.visible=true;owner.userData.emoting=true;c.updateReelingAnimation(owner,true,.1);assert.equal(owner.userData.reelAnimation.weight,0);
 owner.userData.emoting=false;c.updateReelingAnimation(owner,true,.1);assert(owner.userData.reelAnimation.weight>0);
 const legacy=setup(false),y=legacy.rod.position.y;legacy.c.updateReelingAnimation(legacy.owner,true,.1);assert.notEqual(legacy.rod.position.y,y);for(let i=0;i<20;i++)legacy.c.updateReelingAnimation(legacy.owner,false,.1);assert.equal(legacy.rod.position.y,y);
 assert(source.includes("updateReelingAnimation(player,fishingState==='reeling'&&!!minigame.active,dt)"));assert(source.includes('updateReelingAnimation(p.mesh,p.lastData?.reeling===true,dt)'));
});

test('the free left hand tracks the left-side crank and the rod hand stays at its grip',()=>{
 const {c,owner,body,rod}=setup();const C=c.window.Character3D;
 assert(rod.getObjectByName('reelHandle').position.x<0);assert(rod.getObjectByName('reelCrank').position.x<0);
 for(const phase of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  C.animateReel(body,phase,1);let leftMin=Infinity,leftMax=-Infinity,rightMin=Infinity,rightMax=-Infinity;
  for(const batch of body.userData.walkBatches)for(const v of batch.emoteVertices){if(v.part!=='paw')continue;const x=batch.geometry.attributes.position.getX(v.index);if(v.side<0){leftMin=Math.min(leftMin,x);leftMax=Math.max(leftMax,x);}else{rightMin=Math.min(rightMin,x);rightMax=Math.max(rightMax,x);}}
  assert(Math.abs((leftMin+leftMax)/2-.38)<1e-6,'reeling paw stays on the left crank');assert(Math.abs((rightMin+rightMax)/2-.56)<1e-6,'rod-holding paw remains in place');
 }
});
