const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('../vendor/three.min.js');const root=path.join(__dirname,'..'),c=vm.createContext({THREE,window:{}});vm.runInContext(fs.readFileSync(path.join(root,'character3d.js'),'utf8'),c);
function build(ears,hair){const t=()=>new THREE.Texture();return c.window.Character3D.buildCharacter({hair,hairColor:'#574577'},{base:'#dca3ca',belly:'#fff',parts:{ears,eyes:'standard',nose:'cat',tail:'none',misc:'none'},pc:{}},{headFront:t(),headBack:t(),torsoFront:t(),torsoBack:t()});}
test('pointed, round and floppy ears remain mostly visible through full hairstyles from the front',()=>{
 for(const ears of ['cat','bear','mouse','dog','bunny','fox'])for(const hair of ['afro','curly','long','messy','bob','spiky']){
  const model=build(ears,hair);model.updateMatrixWorld(true);const hg=model.getObjectByName('hair'),pair=[];model.userData.modelSources.traverse(o=>{if(o.name==='ear')pair.push(o);});assert.equal(pair.length,2);
  for(const ear of pair){const box=new THREE.Box3().setFromObject(ear);let hits=0,clear=0;
   for(let a=1;a<10;a++)for(let b=1;b<10;b++){const x=THREE.MathUtils.lerp(box.min.x,box.max.x,a/10),y=THREE.MathUtils.lerp(box.min.y,box.max.y,b/10),ray=new THREE.Raycaster(new THREE.Vector3(x,y,5),new THREE.Vector3(0,0,-1)),eh=ray.intersectObject(ear)[0],hh=ray.intersectObject(hg,true)[0];if(eh){hits++;if(!hh||eh.distance<hh.distance)clear++;}}
   assert(hits>10);assert(clear/hits>=.6,ears+'/'+hair+' ear is obscured: '+clear+'/'+hits);
  }
 }
});
test('ear interiors move with the outer ear while cropped styles and head shape retain their fit',()=>{
 for(const ears of ['cat','bear','mouse','dog','bunny','fox']){
  const rest=build(ears,'none'),full=build(ears,'afro');const delta=name=>full.getObjectByName(name).position.clone().sub(rest.getObjectByName(name).position);assert(delta('ear').distanceTo(delta('innerEar'))<1e-8);assert(full.getObjectByName('head').position.equals(rest.getObjectByName('head').position));
  for(const hair of ['buzzed','undercut','slicked','mohawk'])assert(build(ears,hair).getObjectByName('ear').position.equals(rest.getObjectByName('ear').position));
 }
 assert(!build('none','afro').getObjectByName('ear'));
});

test('retained 2D ear overlay draws only ears without clearing hair or repainting the face',()=>{
 const source=fs.readFileSync(path.join(root,'ui.js'),'utf8'),calls=[],ctx={clearRect(){calls.push('clear');}},context=vm.createContext({drawEars:(ctx,id)=>calls.push(id)});
 const a=source.indexOf('function drawSpecies('),b=source.indexOf('function restorePants(',a);vm.runInContext(source.slice(a,b),context);
 context.drawSpecies(ctx,'fox','#abc','#fff','#000',false,{},false,true);assert.deepEqual(calls,['fox']);
});

test('inner ear facets stay inside the outer ear silhouette across species and hairstyles',()=>{
 for(const ears of ['cat','fox','wolf','bat','raccoon','protogen','owl','squirrel','skunk','hedgehog','dragon','shark','bunny','dog','elephant','mouse','koala','chinchilla','bear'])for(const hair of ['none','afro']){
  const model=build(ears,hair),outer=[],inner=[];
  model.userData.modelSources.updateMatrixWorld(true);
  model.userData.modelSources.traverse(o=>{if(o.name==='ear')outer.push(o);if(o.name==='innerEar')inner.push(o);});
  assert.equal(inner.length,2,ears);assert.equal(outer.length,2,ears);
  for(let k=0;k<2;k++){
   const a=outer[k],b=inner[k];assert(b.rotation.equals(a.rotation),ears+' rotation');
   const shell=new THREE.Mesh(a.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));shell.position.copy(a.position);shell.rotation.copy(a.rotation);shell.scale.copy(a.scale);shell.updateMatrixWorld(true);
   const vertices=b.geometry.attributes.position;
   for(let i=0;i<vertices.count;i++){
    const point=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(b.matrixWorld);
    const ray=new THREE.Raycaster(new THREE.Vector3(point.x,point.y,5),new THREE.Vector3(0,0,-1));
    assert(ray.intersectObject(shell).length,ears+'/'+hair+' inner vertex outside outer silhouette');
   }
  }
 }
});