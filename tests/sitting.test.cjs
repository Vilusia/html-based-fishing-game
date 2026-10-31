const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
function setup(){const player=new THREE.Group(),body=new THREE.Group();body.name='playerSprite';body.position.y=1.46875;body.userData={is3D:true,cfg:{}};player.add(body);let builds=0,sends=0;
 const c=vm.createContext({THREE,player,isSitting:false,isProne:false,isDiving:false,isSailing:false,isGuitarActive:false,isGloveActive:false,fishingState:'idle',playerVelocity:new THREE.Vector3(),controls:{jump:true},lastJumpTime:50,getTerrainHeight:()=>0,sendUpdate:()=>sends++,replaceCharacterBody:(owner,cfg)=>{builds++;body.userData.cfg=cfg;return body;}});
 vm.runInContext(source.slice(source.indexOf('function setSitting('),source.indexOf('function bellySlideDirection(')),c);return {c,player,body,builds:()=>builds,sends:()=>sends};}
test('sit locks horizontal velocity in place and rejects airborne or busy players',()=>{
 const s=setup();s.c.playerVelocity.set(1,0,1);assert(s.c.setSitting(true));assert.equal(s.c.isSitting,true);assert.equal(s.c.controls.jump,false);assert.equal(s.c.lastJumpTime,0);assert.equal(s.c.playerVelocity.length(),0);assert.equal(s.player.position.length(),0);assert.equal(s.sends(),1);
 assert(s.c.setSitting(false));assert.equal(s.c.isSitting,false);s.player.position.y=1;assert.equal(s.c.setSitting(true),false);s.player.position.y=0;s.c.isDiving=true;assert.equal(s.c.setSitting(true),false);
});
test('seated pose smoothly settles, rebuilds only on transitions and restores standing',()=>{
 const s=setup();for(let i=0;i<40;i++)s.c.applySittingPose(s.player,true,.016);assert.equal(s.builds(),1);assert.equal(s.body.userData.cfg.sitting,true);assert(Math.abs(s.body.position.y-1.16)<.001);
 s.c.applySittingPose(s.player,false,.016);assert.equal(s.builds(),2);assert.equal(s.body.userData.cfg.sitting,false);assert(s.body.position.y>1.16);
});
test('both X and Space stand up without triggering a jump',()=>{
 const s=setup(),start=source.indexOf("        if(e.code===(k.sit||'KeyX'))"),end=source.indexOf('        // Movement',start);vm.runInContext('function handle(e){const k={sit:"KeyX",jump:"Space"};'+source.slice(start,end)+'}',s.c);
 s.c.handle({code:'KeyX',repeat:false,preventDefault(){}});assert.equal(s.c.isSitting,true);s.c.handle({code:'Space',repeat:false,preventDefault(){}});assert.equal(s.c.isSitting,false);assert.equal(s.c.controls.jump,false);
 s.c.handle({code:'KeyX',repeat:false,preventDefault(){}});s.c.handle({code:'KeyX',repeat:true,preventDefault(){}});assert.equal(s.c.isSitting,true);s.c.handle({code:'KeyX',repeat:false,preventDefault(){}});assert.equal(s.c.isSitting,false);
});
