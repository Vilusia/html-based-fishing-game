const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
const c=vm.createContext({THREE});vm.runInContext(source.slice(source.indexOf('function bellySlideDirection('),source.indexOf('function sync3DRodGrip(')),c);
const view={getWorldDirection:v=>v.set(0,0,-1)};
test('slides follow movement controls rather than facing, including normalized diagonals',()=>{
 for(const [input,x,z] of [[{forward:true},0,-1],[{backward:true},0,1],[{right:true},1,0],[{left:true},-1,0]]){const dir=c.bellySlideDirection(view,input,null,2);assert.equal(dir.x,x);assert.equal(dir.z,z);assert.equal(dir.y,0);}
 const diagonal=c.bellySlideDirection(view,{backward:true,left:true},null,0);assert(diagonal.x<0&&diagonal.z>0);assert(Math.abs(diagonal.length()-1)<1e-8);
 const released=c.bellySlideDirection(view,{}, {x:1,z:0},0);assert.equal(released.x,1);assert.equal(released.z,0);
});
test('slide pose becomes flat and restores the normal arm configuration only once',()=>{
 const owner=new THREE.Group(),body=new THREE.Group();body.name='playerSprite';body.position.y=1.46875;body.userData={is3D:true,cfg:{}};owner.add(body);let builds=0;
 c.replaceCharacterBody=(obj,cfg)=>{builds++;body.userData.cfg=cfg;return body;};for(let i=0;i<30;i++)c.applyBellySlidePose(owner,true,.016);
 assert.equal(builds,1);assert(body.rotation.x>1.56);assert(Math.abs(body.position.y-.86)<.001);assert.equal(body.userData.cfg.bellySliding,true);
 c.applyBellySlidePose(owner,false,.016);assert.equal(body.userData.cfg.bellySliding,false);assert.equal(builds,2);
});
