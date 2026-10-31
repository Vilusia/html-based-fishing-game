const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const root=path.join(__dirname,'..'),ui=fs.readFileSync(path.join(root,'ui.js'),'utf8'),c=vm.createContext({THREE,window:{}});vm.runInContext(fs.readFileSync(path.join(root,'character3d.js'),'utf8'),c);const C=c.window.Character3D;
function build(cfg={},extra={}){const tex=()=>new THREE.Texture();return C.buildCharacter(cfg,{base:'#dca3ca',belly:'#fff',parts:'cat',pc:{handColor:'#eee',footColor:'#ddd'}},{headFront:tex(),headBack:tex(),torsoFront:tex(),torsoBack:tex(),...extra});}
function bounds(part){return new THREE.Box3().setFromObject(part);}
test('longer legs expose a separate trouser area while feet retain the ground plane',()=>{
 const body=build(),leg=body.getObjectByName('leg'),torso=body.getObjectByName('torso'),foot=body.getObjectByName('foot');
 assert(leg.scale.y>.3);assert(bounds(torso).min.y-bounds(foot).max.y>.3,'visible leg space beneath shirts');assert(bounds(leg).max.y>bounds(torso).min.y,'hips overlap torso without a gap');
 assert(Math.abs(bounds(foot).min.y+1.46875)<.01,'standing feet stay grounded');assert.equal(body.userData.hipY,C.proportions.hipY);
});
test('all upper-body equipment keeps its fit and color with the raised body',()=>{
 const body=build({holdingRod:true,hair:'mohawk'},{hat:{id:'cap',type:'cap',color:'#567'},shirt:{id:'hoodie',type:'hoodie',color:'#567'},collar:{id:'bell',type:'bell',color:'#c44'}}),lift=C.proportions.upperLift;
 assert.equal(body.getObjectByName('head').position.y,.2+lift);assert.equal(body.getObjectByName('torso').position.y,-.65+lift);assert.equal(body.getObjectByName('paw').position.y,-.92+lift);
 const band=bounds(body.getObjectByName('collarBand')),head=bounds(body.getObjectByName('head'));assert(band.min.y<head.min.y&&band.max.y>head.min.y);
});
test('long seated legs remain forward and grounded after the sitting transition',()=>{
 const body=build({sitting:true}),owner=new THREE.Group();owner.add(body);body.position.y=1.46875;
 const ctx=vm.createContext({THREE,replaceCharacterBody:()=>body});vm.runInContext(ui.slice(ui.indexOf('function applySittingPose('),ui.indexOf('function bellySlideDirection(')),ctx);
 for(let i=0;i<60;i++)ctx.applySittingPose(owner,true,1/60);owner.updateMatrixWorld(true);
 assert(Math.abs(bounds(body.getObjectByName('foot')).applyMatrix4(body.matrixWorld).min.y)<.01);assert(body.getObjectByName('foot').position.z>.8);assert(bounds(body.getObjectByName('torso')).applyMatrix4(body.matrixWorld).min.y>.08);
 ctx.applySittingPose(owner,false,1/60);assert(body.position.y>.88);
});
test('rod, fish, tools and overhead labels follow the new hand and head positions without accumulating offsets',()=>{
 const ctx=vm.createContext({THREE,saveState:{model3D:true},replaceCharacterBody:(owner,cfg)=>{owner.getObjectByName('playerSprite').userData.cfg=cfg;return owner.getObjectByName('playerSprite');}});
 vm.runInContext(ui.slice(ui.indexOf('function sync3DRodGrip('),ui.indexOf('function updateSpriteDirection(')),ctx);
 for(const kind of ['rod','heldFishSprite','axe']){const owner=new THREE.Group(),body=build();body.position.y=1.46875;owner.add(body);const item=new THREE.Group();item.name=kind;item.userData={is3D:true,toolType:'axe'};owner.add(item);const label=new THREE.Group();label.name='nameTag';label.position.y=3.05;owner.add(label);
 for(let i=0;i<10;i++){ctx.sync3DRodGrip(owner);ctx.syncCharacterOverhead(owner);}
 assert(Math.abs(item.position.y-(1.46875+C.proportions.upperLift+(kind==='heldFishSprite'?-.45:-.62)))<1e-6,kind+' follows grip');assert.equal(label.position.y,3.05+C.proportions.upperLift);
 body.userData.upperLift=0;ctx.syncCharacterOverhead(owner);assert.equal(label.position.y,3.05,'retained 2D height restores');}
});
test('walk and gesture animations reset the new geometry without moving upper-body rest vertices',()=>{
 const body=build();for(let i=0;i<50;i++)C.animateWalk(body,true,1/60);for(let i=0;i<50;i++)C.animateWalk(body,false,1/60);
 for(const id of ['wave','cheer','dance','clap','heart','airplane']){C.animateEmote(body,id,.6);C.animateEmote(body,null,0);}
 for(const batch of body.userData.walkBatches){const p=batch.geometry.attributes.position.array;assert([...p].every(Number.isFinite));for(let i=0;i<p.length;i++)assert(Math.abs(p[i]-batch.rest[i])<1e-6);}
});
