const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../ui.js'),'utf8');
test('rod synchronization switches mode, preserves cast and visibility, and restores the free hand',()=>{
 const owner=new THREE.Group(),cfg={};let builds=0;
 const body=new THREE.Group();body.name='playerSprite';body.position.y=1.46875;body.userData={is3D:true,cfg};owner.add(body);
 const rod=new THREE.Group();rod.name='rod';rod.userData={is3D:false,rodId:'oak'};rod.rotation.x=.8;owner.add(rod);
 const c=vm.createContext({saveState:{model3D:true},makeRod:id=>{const r=new THREE.Group();r.name='rod';r.userData={is3D:true,rodId:id};return r;},rodAngleFor:(r,casting)=>casting?1.05:.3,disposeCharacterBody:()=>{},replaceCharacterBody:(group,next)=>{builds++;body.userData.cfg=next;return body;}});
 const a=source.indexOf('function sync3DRodGrip('),b=source.indexOf('function updateSpriteDirection(',a);vm.runInContext(source.slice(a,b),c);c.sync3DRodGrip(owner);
 const active=owner.getObjectByName('rod');assert.equal(active.userData.rodId,'oak');assert.equal(active.rotation.x,1.05);assert.equal(body.userData.cfg.holdingRod,true);assert(Math.abs(active.position.y-.84875)<1e-8);assert.equal(active.position.z,.43);
 c.sync3DRodGrip(owner);assert.equal(builds,1,'unchanged grip must not rebuild every frame');active.visible=false;c.sync3DRodGrip(owner);assert.equal(body.userData.cfg.holdingRod,false);assert.equal(builds,2);
});

test('held fish follows the right hand and releasing it restores the rod or resting pose',()=>{
 const owner=new THREE.Group(),body=new THREE.Group(),fish=new THREE.Group(),rod=new THREE.Group();let builds=0;
 body.name='playerSprite';body.position.y=1.46875;body.userData={is3D:true,cfg:{}};fish.name='heldFishSprite';fish.userData={is3D:true};rod.name='rod';rod.userData={is3D:true};owner.add(body,fish,rod);
 const c=vm.createContext({saveState:{model3D:true},replaceCharacterBody:(g,cfg)=>{builds++;body.userData.cfg=cfg;return body;}});
 vm.runInContext(source.slice(source.indexOf('function sync3DRodGrip('),source.indexOf('function updateSpriteDirection(')),c);
 c.sync3DRodGrip(owner);assert.equal(body.userData.cfg.holdingFish,true);assert.equal(body.userData.cfg.holdingRod,false);assert(Math.abs(fish.position.y-1.01875)<1e-8);assert.equal(fish.position.z,.5);
 c.sync3DRodGrip(owner);assert.equal(builds,1,'sway does not rebuild the body');
 fish.visible=false;c.sync3DRodGrip(owner);assert.equal(body.userData.cfg.holdingFish,false);assert.equal(body.userData.cfg.holdingRod,true);
 rod.visible=false;c.sync3DRodGrip(owner);assert.equal(body.userData.cfg.holdingFish,false);assert.equal(body.userData.cfg.holdingRod,false);
});
